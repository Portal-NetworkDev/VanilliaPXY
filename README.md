<img width="800" height="450" alt="VanilliaPXY" src="https://github.com/user-attachments/assets/d54fa217-8137-48c6-8623-912e59e29c12" />

## VanilliaPXY (beta)

VanilliaPXY is a streaming transport backend for browser-side web proxy engines.

## Install

```bash
npm install vanilliapxy
```

The package uses Node.js 24.x and includes the server runtime and its dependencies.

## Use as a server

```js
import { server } from "vanilliapxy";

server.listen(8080);
```

Or run the included server directly:

```bash
npm start
```

## Proxy endpoint

The default endpoint is:

`/vanillia?url=https://example.com/`

The development backend is currently available at:

https://8080.testserver.vanilliaruntime.portal-network.com/

Example:

https://8080.testserver.vanilliaruntime.portal-network.com/vanillia?url=https://example.com/

## Configuration

The endpoint can be changed with `PROXY_ENDPOINT`.

The server also supports the existing environment variables documented in `HELP.md`.

## Contributing

[Join our Discord server](https://discord.gg/bU4SJ2n7yj)

VanilliaPXY is completely open source. Use it for your own proxys or whatever. Just dont claim it yours when its not.
