# Super Simple URL Shortener with Cloudflare Pages

Let's create a super simple URL Shortener with Cloudflare Pages!
By creating this application you will experience:

- Creating web pages with Hono.
- Using Cloudflare KV in your application.
- Deploying your application to Cloudflare Pages.

## The application feature

- Developing with Vite.
- Having UI.
- The main code is less than 100 lines.
- Validation with Zod.
- Handling validation error.
- CSRF Protection.

## Demo

![Demo](https://github.com/yusukebe/url-shortener/assets/10682/aab18332-b38e-4425-a5f8-e25b71fa9168)

## Tutorial

### Setup Project

#### Init

Initialize your project by using _create-hono_.
After run the following command, select the "**_cloudflare-pages_**" template.

```txt
npm create hono@latest url-shortener
```

#### Run the dev server

The dev server will start by running the following command.

```txt
npm run dev
```

#### Create KV

Create a Cloudflare KV namespace to store URL and a shortened key.
Run the `wrangler` command.

```txt
npm run wrangler kv:namespace create KV
```

And create and edit `wrangler.toml`.

```toml
name = "url-shortener"
compatibility_date = "2023-12-01"

[[kv_namespaces]]
binding = "KV"
id = "replace-with-your-kv-id-xxxxxx"
```

#### Install dependencies

Install `zod` and `@hono/zod-validator` to make a validator later.

```txt
npm i zod @hono/zod-validator
```

### Write your Code

See the source code in this repository.

### Deploying

Just run the command to deploy to Cloudflare Pages. You will be asked about the project name, so answer it.

```txt
npm run deploy
```

## Author

Yusuke Wada <https://github.com/yusukebe>

## License

MIT
