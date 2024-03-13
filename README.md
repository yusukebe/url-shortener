# Creating URL Shortener with Cloudflare Pages

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

## Source Code

You can see the entire source code here.

## Tutorial

I'll show you how to create your application!

---

## Account

To deploy an application to Cloudflare Pages, a Cloudflare account is needed. Since it can be used within the free tier, if you don't have an account, please create one.

## Project Setup

Let's start by setting up the project.

### Initial Project

We'll use a CLI called "_create-hono_" to create the project. Execute the following command:

```txt
npm create hono@latest url-shortener
```

When prompted to choose a template, select "**_cloudflare-pages_**". Then, when asked about installing dependencies and which package manager to use, press Enter to proceed.

Now, you have your initial project setup. Enter the project directory:

```txt
cd url-shortener
```

### Start the Development Server

Let's start the development server. It's easy, just run the following command:

```txt
npm run dev
```

By default, it launches at `http://localhost:5173`, so access it. You should be able to see the page.

### Create KV

This app uses Cloudflare KV, a Key-Value store. To use it, you need to create a KV project by running the following command:

```txt
npm exec wrangler kv:namespace create KV
```

You'll see a message like this:

```txt
🌀 Creating namespace with title "url-shortener-KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "KV", id = "xxxxxx" }
```

Copy the `id` value `xxxxxx`, and write it into `wrangler.toml` in the format shown above.

### Install Dependencies

For this app, we'll validate input values. For that, we'll include the Zod library and Hono middleware.

```txt
npm i zod @hono/zod-validator
```

### Remove `public`

Finally, the starter template includes a `public` directory with CSS for customization, but since we won't use it this time, let's remove it.

```txt
rm -rf public
```

## Writing Code

Now, let's start coding.

### Organize Layout

We'll arrange a common layout for the pages by editing `src/renderer.tsx`.

To save time, we'll use a CSS framework called [new.css](https://newcss.net/), which is a _class-less_ framework. This means you don't need to specify any special `class` values; the existing HTML styles will automatically look good.

The final version will look like this:

```tsx
import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html>
      <head>
        <link rel="stylesheet" href="https://fonts.xz.style/serve/inter.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css"></link>
      </head>
      <body>
        <header>
          <h1>
            <a href="/">URL Shortener</a>
          </h1>
        </header>
        <div>{children}</div>
      </body>
    </html>
  )
})
```

### Making the top Page

First, we're making a top page. It responds when someone visits the main path `/`. Here's how we set it up.

```ts
app.get('/', (c) => {
  //...
})
```

Inside the handler, we use `c.render()` to return HTML with our layout applied. We've set it up to send a POST request to `/create` to make a short URL.

```tsx
app.get('/', (c) => {
  return c.render(
    <div>
      <h2>Create shorten URL!</h2>
      <form action="/create" method="post">
        <input
          type="text"
          name="url"
          autocomplete="off"
          style={{
            width: '80%'
          }}
        />
        &nbsp;
        <button type="submit">Create</button>
      </form>
    </div>
  )
})
```

This will look something like this:

![Screenshot](https://github.com/yusukebe/url-shortener/assets/10682/64bf3e39-8792-49e9-95ef-1f0bb813f2a8)

### Making a Validator

We want to check the form data from the top page. So, let's make a validator.

First, we import stuff from the library we installed earlier.

```ts
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
```

Then, we make a schema. This is how we say, "We want a string that's a URL named `url`".

```ts
const schema = z.object({
  url: z.string().url()
})
```

We register this with `zValidator`. The `form` we pass as the first argument is because we want to handle form requests.

```ts
const validator = zValidator('form', schema)
```

Let's make an endpoint to handle the POST request to `/create` using our finished validator. Since a validators is middleware, we can put it before our handler. Then, we use `c.req.valid()` to get the value, which in this case, is named `url`.

```ts
app.post('/create', validator, async (c) => {
  const { url } = c.req.valid('form')

  // TODO: Create a short URL
})
```

If it passes the check, the value will be in `url`.

### Defining KV Types

Now that we have the form value, let's write the logic to make a short URL.

First, we define the types for KV we're using. `KVNamespace` represents KV. In Hono, if you pass `Bindings` as a name for Cloudflare's Bindings type to the Hono class generics, you can then access `c.env.KV` with types.

```ts
type Bindings = {
  KV: KVNamespace
}

const app = new Hono<{
  Bindings: Bindings
}>()
```

### Generating and Saving Keys

Let's make a function named `createKey()` to generate keys for short URLs. We need the KV object and the URL to generate a key.

```ts
app.post('/create', validator, async (c) => {
  const { url } = c.req.valid('form')

  const key = await createKey(c.env.KV, url)

  // ...
})
```

There are a few strategies for generating a key, but we'll go with this:

- Create a random string.
- Use 6 characters of it.
- If there's no object in KV with that key, save the URL as its value.
- If there is, run `createKey()` again.
- Return the created key.

You can get and set values in KV with `kv.get(key)` and `kv.put(key, value)`.

The finished function looks like this:

```ts
const createKey = async (kv: KVNamespace, url: string) => {
  const uuid = crypto.randomUUID()
  const key = uuid.substring(0, 6)
  const result = await kv.get(key)
  if (!result) {
    await kv.put(key, url)
  } else {
    return await createKey(kv, url)
  }
  return key
}
```

### Showing the Result

Now we've made a key. The URL with this key as the pathname is our short URL. If you're developing locally and your key was, for example, `abcdef`, it would be:

```txt
http://localhost:5173/abcdef
```

We made a page to display this URL in an `input` element for easy copying, using `autofocus` too.

```tsx
app.post('/create', validator, async (c) => {
  const { url } = c.req.valid('form')
  const key = await createKey(c.env.KV, url)

  const shortenUrl = new URL(`/${key}`, c.req.url)

  return c.render(
    <div>
      <h2>Created!</h2>
      <input
        type="text"
        value={shortenUrl.toString()}
        style={{
          width: '80%'
        }}
        autofocus
      />
    </div>
  )
})
```

Now, the short URL is created and displayed nicely.

![Screenshot](https://github.com/yusukebe/url-shortener/assets/10682/2eda47a4-8adb-460a-8432-289a00a36779)

### Redirecting

Now that we can generate short URLs, let's make them redirect to the registered URL. We use regex to match the address like `/abcdef` and, in the handler, get the value from KV using that string as the key. If it exists, that's the original URL, and we redirect there. If not, we go back to the top page.

```ts
app.get('/:key{[0-9a-z]{6}}', async (c) => {
  the key = c.req.param('key')
  const url = await c.env.KV.get(key)

  if (url === null) {
    return c.redirect('/')
  }

  return c.redirect(url)
})
```

### Handling Errors

We're almost done, and it's looking good!

But one issue is what happens if someone puts a non-URL value in the form. The validator catches the error, but it just shows a string of JSON.

![Screenshot](https://github.com/yusukebe/url-shortener/assets/10682/c8d809eb-4374-40d0-9745-b00a020410b3)

Let's show an error page instead. For this, we write a hook as the third argument to `zValidator`. `result` is the result object from Zod validation, so we use it to decide what to do based on whether it was successful.

```tsx
const validator = zValidator('form', schema, (result, c) => {
  if (!result.success) {
    return c.render(
      <div>
        <h2>Error!</h2>
        <a href="/">Back to top</a>
      </div>
    )
  }
})
```

Now, if there's a validation error, an error message is shown.

![Screenshot](https://github.com/yusukebe/url-shortener/assets/10682/e8c5e93a-feaa-4c61-b54a-b786ee9e83c2)

#### Adding a CSRF Protector

This is the last step! Our URL shortening service is pretty great as it is, but there's a chance someone could send a POST request directly from a form on a different site. So, we use Hono's built-in middleware, [CSRF Protector](https://hono.dev/middleware/builtin/csrf).

It's super easy to use. Just import it.

```ts
import { csrf } from 'hono/csrf'
```

And use it before the handler on routes where you want it.

```ts
app.post('/create', csrf(), validator, async (c) => {
  const { url } = c.req.valid('form')
  const key = await createKey(c.env.KV, url)
  //...
})
```

And that's it! You've made a URL shortening app with a UI, validation, error handling, and CSRF protection, all within about 100 lines in `index.tsx`!

## Deploying

Let's deploy to Cloudflare Pages. Run the following command:

```txt
npm run deploy
```

If it's your first time, you'll be asked a few questions like this. Just answer them:

```txt
Create a new project
? Enter the name of your new project: › url-shortener
? Enter the production branch name: › main
```

After running the command, a URL for your deployed site will be displayed. It might look something like this:

```txt
https://random-strings.url-shortener-abc.pages.dev/
```

It takes a bit of time to be ready for viewing after it's created, so let's wait. In some cases, you might be able to view it by accessing `url-shortener-abc.pages.dev`, removing the initial host name part.

### Setting KV in the Dashboard

But wait! You might see an "_Internal Server Error_". This is because KV settings are not done for the production environment. Despite writing settings in `wrangler.toml`, they won't apply; dashboard settings are required. Go to the settings page of the Pages project you created, navigate to the KV section, and specify the namespace you created earlier with the name KV.

![Screenshot](https://github.com/yusukebe/url-shortener/assets/10682/592b16a9-b124-4bf4-852f-c523aea0b249)

Deploying again should work now!

## Deleting the Project

If you're not planning to use it, remember to delete the production Pages project.

## Summary

We made a URL shortening app using Cloudflare KV and Hono and deployed it to Cloudflare Pages. The main `src/index.tsx` is about 100 lines, but it's a complete app with page layouts, validation, and error handling, not just "returning JSON". However, as it stands, external users could potentially create unlimited short URLs, hitting KV indefinitely, so consider this for further development.

How was it? Pretty neat, right? Creating apps on Cloudflare Pages with Hono offers a lot of possibilities, so give it a try. Also, if you're building a bigger app, [HonoX](https://github.com/honojs/honox), which allows for file-based routing, might be more convenient, so consider using that too.

---

## Author

Yusuke Wada <https://github.com/yusukebe>

## License

MIT
