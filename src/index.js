import http from "node:http";

const port = Number(process.env.PORT) || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("VanilliaPXY");
});

server.listen(port, () => {
  console.log(`VanilliaPXY listening on ${port}`);
});
