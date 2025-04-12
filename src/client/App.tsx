import { useEffect, useRef, useState } from "react";
import { SpeechRecognition } from "./SpeechRecognition";

// Define types for messages
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const resRef = useRef<NodeJS.Timeout | null>(null);
  const speakingQueue = useRef<ArrayBuffer[]>([]);
  const isSpeaking = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const playNextAudio = () => {
    console.log("playNextAudio called");

    console.log("speakingQueue", speakingQueue.current);
    
    
    if (speakingQueue.current.length === 0 || isSpeaking.current) return;

    const audioData = speakingQueue.current.shift()!;
    isSpeaking.current = true;

    // Initialize AudioContext on first use
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    audioContextRef.current.decodeAudioData(audioData).then(buffer => {
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current!.destination);

      source.onended = () => {
        isSpeaking.current = false;
        playNextAudio(); // Play next in queue
      };

      source.start();
    }).catch(error => {
      console.error("Audio playback error:", error);
      isSpeaking.current = false;
      playNextAudio(); // Try next even if current failed
    });
  };

  function openCon() {
    const ws = new WebSocket("ws://localhost:8080");
    ws.onopen = (e) => {
      console.log("WebSocket is open now.");
    }
    ws.onmessage = (e) => {
      console.log('data', e.data);
      if (e.data instanceof Blob) {
        e.data.arrayBuffer().then(buffer => {
          speakingQueue.current.push(buffer);
          playNextAudio();
        });
      }
      else if (typeof e.data === "string") {
        if (e.data.includes('text:')) {
          const tokens = e.data.split(':')[1];
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const updatedMessages = [...prev];
            if (last && last.role == 'assistant') {
              updatedMessages[updatedMessages.length - 1].content += tokens;
            } else {
              updatedMessages.push({ role: 'assistant', content: tokens });
            }
            return updatedMessages;
          });
        }
      }
    }
    ws.onclose = (e) => {
      console.log("WebSocket is closed now.");
    }
    ws.onerror = (e) => {
      console.error("WebSocket error: ", e);
    }
    setWs(ws);
    const recognition = new (window as any).webkitSpeechRecognition() as SpeechRecognition;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      const result = Array.from(event.results).map((res: any) => res.isFinal ? res[0].transcript : "").join('. ')
      setTranscript(result);
      if (resRef.current) {
        clearTimeout(resRef.current);
      }
      resRef.current = setTimeout(() => {
        recognition.stop();
        console.log("Speech recognition stopped");
        if (result.trim()) {
          setMessages(prev => [...prev, { role: 'user', content: result }]);
          ws.send(result);
        }
      }, 1000);
    }
    recognition.onspeechend = () => {
      console.log("Speech has stopped");
      if (resRef.current) {
        clearTimeout(resRef.current);
      }
      recognition.stop();
    }
    setRecognition(recognition);
  }

  function closeCon() {
    recognition?.stop();
    if (ws) {
      ws.close();
      setWs(null);
    }
  }

  const handleSendMessage = () => {
    if (inputMessage.trim() && ws) {
      setMessages(prev => [...prev, { role: 'user', content: inputMessage }]);
      ws.send(inputMessage);
      setInputMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="App h-screen w-screen bg-gray-100 flex flex-col p-4">
      {/* Chat interface */}
      <div className="flex-grow flex flex-col bg-white rounded-lg shadow-lg p-4 mb-4 overflow-hidden">
        {/* Messages container */}
        <div className="flex-grow overflow-y-auto p-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">
              Start a conversation by sending a message or using voice input
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`mb-4 max-w-3/4 ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
              >
                <div
                  className={`p-3 rounded-lg ${message.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                >
                  {message.content}
                </div>
                <div className="text-xs text-gray-500 mt-1 px-2">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Current transcript display */}
        {transcript && (
          <div className="bg-gray-100 p-2 mb-2 rounded italic text-gray-600">
            Hearing: {transcript}
          </div>
        )}

        {/* Input area */}
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-grow p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!ws}
          />
          <button
            onClick={handleSendMessage}
            disabled={!ws || !inputMessage.trim()}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:bg-gray-300"
          >
            Send
          </button>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={openCon}
          disabled={ws !== null}
          className="bg-green-500 text-white px-6 py-3 rounded-lg shadow hover:bg-green-600 disabled:bg-gray-300"
        >
          Connect
        </button>
        <button
          onClick={() => recognition?.start()}
          disabled={!recognition}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow hover:bg-blue-600 disabled:bg-gray-300"
        >
          Start Voice
        </button>
        <button
          onClick={() => closeCon()}
          disabled={!ws}
          className="bg-red-500 text-white px-6 py-3 rounded-lg shadow hover:bg-red-600 disabled:bg-gray-300"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

export default App;