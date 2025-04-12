import express from "express";
import ViteExpress from "vite-express";
import dotenv from 'dotenv'

dotenv.config()

const app = express();
ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000..."),
);