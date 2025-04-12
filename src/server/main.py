import asyncio
from websockets.asyncio.server import serve
import ollama
from TTS.api import TTS
import wave
import numpy as np
import io

userMessages = dict()
audios = dict()
systemPrompt = 'You are a friendly and supportive AI companion. Your role is to always listen patiently, respond within 30 to 80 words unless you are asked to do so. you should use as punctuations to break the sentences for text to speech.';
separators = ['.', '?', ',', ';']
tts = TTS(model_name="tts_models/en/ljspeech/glow-tts", progress_bar=False, gpu=False)



async def handler(websocket):
    print('Client connected from: ', websocket.remote_address)
    userMessages[websocket.remote_address] = [{'role': 'system', 'content': systemPrompt}]
    audios[websocket.remote_address] = {'speaking': False, 'queue': []}
    loop = asyncio.get_running_loop()
    try:
        async for message in websocket:
            print(f"Received message: {message}")
            if(len(message)>0):
                await asyncio.to_thread(getLlamaResponse, websocket, message, loop)
            
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print('Client disconnected: ', websocket.remote_address)
        userMessages.pop(websocket.remote_address)
        audios.pop(websocket.remote_address)
        await websocket.close()

async def main():
    async with serve(handler=handler, host="localhost", port=8080) as server:
        await server.serve_forever()

def getLlamaResponse(websocket, message, loop):
    try:
        userMessages[websocket.remote_address].append({'role': 'user', 'content': message})
        userMessages[websocket.remote_address].append({'role': 'assistant', 'content': ''})
        stream = ollama.chat(model="tinyllama", messages=userMessages[websocket.remote_address], stream=True)
        print("waiting for ollama response")
        sentence = ""
        for chunk in stream:
            token = chunk['message']['content']
            print(f"Received chunk: {token}")
            asyncio.run(websocket.send(f"text:{token}"))
            sentence += token
            userMessages[websocket.remote_address][-1]['content'] += token
            if(token in separators):
                loop.call_soon_threadsafe(asyncio.create_task, generateVoice(websocket, sentence))
                sentence = ""
        if(sentence != ""):
            loop.call_soon_threadsafe(asyncio.create_task, generateVoice(websocket, sentence))
            sentence = ""
    except Exception as e:
        print(f"Error: {e}")

async def generateVoice(websocket, text):
    print(f"Generating voice for text: {text}")
    try:
        wav = tts.tts(text=text)
        if isinstance(wav, list):
            audio_np = np.array(wav, dtype=np.float32)
        else:
            audio_np = wav.astype(np.float32)
        audio_np = audio_np / np.max(np.abs(audio_np))
        audio_np = (audio_np * 32767).astype(np.int16)
        with io.BytesIO() as wav_buffer:
            with wave.open(wav_buffer, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(22050)  # Common sample rate
                wf.writeframes(audio_np.tobytes())
            await websocket.send(wav_buffer.getvalue())
            
    except Exception as e:
        print(f"Error generating voice: {e}")
asyncio.run(main())