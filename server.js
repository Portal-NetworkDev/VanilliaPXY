import { server } from "./src/index.js";

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8080;
  server.listen(port, () => console.log(`VanilliaPXY listening on ${port}`));
}

export default server;
