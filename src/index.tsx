import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { renderer } from './renderer'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import QRCode from 'qrcode'

type Bindings = {
  KV: KVNamespace
}

const app = new Hono<{
  Bindings: Bindings
}>()

// Apply JSX renderer to all routes
app.all('*', renderer)

// Redirect for shortened URL (valid 6-char key)
app.get('/:key{[0-9a-z]{6}}', async (c) => {
  const key = c.req.param('key')
  const url = await c.env.KV.get(key)

    if (url === null) {
    // Short URL not found: pagina standalone senza layout/header
    return c.html(
      `
      <html>
        <head>
          <title>Link not found</title>
          <meta charset="utf-8" />
        </head>
        <body style="background:#000;color:#fff;font-family:sans-serif;">
          <div style="max-width:600px;margin:60px auto;text-align:center;">
            <h2>Link not found</h2>
            <p>The link you requested is not reachable anymore.</p>
            <p>You will be redirected in 10 seconds to iasociety.org.</p>
          </div>
          <script>
            setTimeout(function () {
              window.location.href = 'https://www.iasociety.org';
            }, 10000);
          </script>
        </body>
      </html>
      `,
      404
    )
  }

  return c.redirect(url)
})

// Redirect root / to /admin/
app.get("/", (c) => {
  return c.redirect("/admin/");
});

// Redirect /admin to /admin/
app.get("/admin", (c) => {
  return c.redirect("/admin/");
});

// Home page with form
app.get('/admin/', (c) => {
  return c.render(
    <div>
      <h2>Create shortened URL!</h2>
      <form action="/admin/create" method="post">
        <input
          type="text"
          name="url"
          autoComplete="off"
          placeholder="Enter URL to shorten..."
          style={{
            width: '80%',
            padding: '6px 8px',
            backgroundColor: '#222',
            color: '#f5f5f5',
            border: '1px solid #555',
            borderRadius: '4px'
          }}
        />
        &nbsp;
        <button type="submit">Create</button>
      </form>

      <p style={{ marginTop: '10px' }}>
        <a href="/admin/history">View history</a>
      </p>

      {/* Focus styles for inputs */}
      <style>
        {`
          input[type="text"],
          input[type="date"] {
            outline: none;
          }
          input[type="text"]:focus,
          input[type="date"]:focus {
            border-color: #00b4d8;
            box-shadow: 0 0 3px #00b4d8;
          }
        `}
      </style>
    </div>
  )
})

const schema = z.object({
  url: z.string().url()
})

// Zod validator with simple error page
const validator = zValidator('form', schema, (result, c) => {
  if (!result.success) {
    return c.render(
      <div>
        <h2>Error!</h2>
        <p>Invalid URL format. Please check and try again.</p>
        <a href="/">Back to top</a>
      </div>
    )
  }
})

// History support in KV (max 500 items)
type HistoryItem = {
  key: string
  url: string
  createdAt: string
}

const HISTORY_KEY = '__history__'

const addToHistory = async (kv: KVNamespace, item: HistoryItem) => {
  const json = await kv.get(HISTORY_KEY)
  let list: HistoryItem[] = []
  if (json) {
    try {
      list = JSON.parse(json) as HistoryItem[]
    } catch {
      list = []
    }
  }
  list.unshift(item)
  if (list.length > 500) {
    list = list.slice(0, 500)
  }
  await kv.put(HISTORY_KEY, JSON.stringify(list))
}

const getHistory = async (kv: KVNamespace): Promise<HistoryItem[]> => {
  const json = await kv.get(HISTORY_KEY)
  if (!json) return []
  try {
    return JSON.parse(json) as HistoryItem[]
  } catch {
    return []
  }
}

// Remove single entry from history array
const removeFromHistory = async (kv: KVNamespace, keyToRemove: string) => {
  const json = await kv.get(HISTORY_KEY)
  if (!json) return
  let list: HistoryItem[]
  try {
    list = JSON.parse(json) as HistoryItem[]
  } catch {
    return
  }
  const filtered = list.filter((item) => item.key !== keyToRemove)
  await kv.put(HISTORY_KEY, JSON.stringify(filtered))
}

// History page with filters
app.get('/admin/history', async (c) => {
  const items = await getHistory(c.env.KV)

  return c.render(
    <div>
      <h2>History (latest {items.length} entries)</h2>
      <p>Showing up to 500 latest shortened URLs.</p>

      {/* Filters: text + date range */}
      <div style={{ marginBottom: '10px', fontSize: '0.85em' }}>
        {/* first row: text search */}
        <div style={{ marginBottom: '6px' }}>
          <label>
            Search (URL / short URL):{' '}
            <input
              id="history-search"
              type="text"
              placeholder="Filter by URL..."
              style={{
                width: '60%',
                padding: '4px 6px',
                backgroundColor: '#222',
                color: '#f5f5f5',
                border: '1px solid #555',
                borderRadius: '4px'
              }}
            />
          </label>
        </div>

        {/* second row: dates + clear */}
        <div>
          <span>
            <label>
              From:{' '}
              <input
                id="history-from"
                type="date"
                style={{
                  padding: '3px 4px',
                  backgroundColor: '#222',
                  color: '#f5f5f5',
                  border: '1px solid #555',
                  borderRadius: '4px'
                }}
              />
            </label>
          </span>
          <span style={{ marginLeft: '10px' }}>
            <label>
              To:{' '}
              <input
                id="history-to"
                type="date"
                style={{
                  padding: '3px 4px',
                  backgroundColor: '#222',
                  color: '#f5f5f5',
                  border: '1px solid #555',
                  borderRadius: '4px'
                }}
              />
            </label>
          </span>
          <button
            id="history-clear-filters"
            type="button"
            style={{ marginLeft: '10px' }}
          >
            Clear filters
          </button>
        </div>
      </div>

      <table
        id="history-table"
        style={{
          fontSize: '0.8em',
          borderCollapse: 'collapse',
          width: '100%',
          border: '1px solid #555',
          backgroundColor: '#111'
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                borderBottom: '1px solid #555',
                padding: '4px',
                textAlign: 'left'
              }}
            >
              Created at
            </th>
            <th
              style={{
                borderBottom: '1px solid #555',
                padding: '4px',
                textAlign: 'left'
              }}
            >
              Original URL
            </th>
            <th
              style={{
                borderBottom: '1px solid #555',
                padding: '4px',
                textAlign: 'left'
              }}
            >
              Short URL
            </th>
            <th
              style={{
                borderBottom: '1px solid #555',
                padding: '4px',
                textAlign: 'left'
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const shortUrl = new URL(`/${item.key}`, c.req.url).toString()
            return (
              <tr key={item.key}>
                <td
                  class="created-at-cell"
                  style={{
                    padding: '4px',
                    verticalAlign: 'top',
                    borderTop: '1px solid #333'
                  }}
                >
                  {item.createdAt}
                </td>
                <td
                  style={{
                    padding: '4px',
                    verticalAlign: 'top',
                    borderTop: '1px solid #333'
                  }}
                >
                  <a href={item.url}>{item.url}</a>
                </td>
                <td
                  style={{
                    padding: '4px',
                    verticalAlign: 'top',
                    borderTop: '1px solid #333'
                  }}
                >
                  <a href={shortUrl}>{shortUrl}</a>
                </td>
                <td
                  style={{
                    padding: '4px',
                    verticalAlign: 'top',
                    whiteSpace: 'nowrap',
                    borderTop: '1px solid #333'
                  }}
                >
                  <button
                    type="button"
                    class="copy-short-btn"
                    data-url={shortUrl}
                  >
                    Copy URL
                  </button>
                   <button
                    type="button"
                    class="qr-copy-btn"
                    data-url={shortUrl}
                    style={{ marginLeft: '6px' }}
                  >
                    Copy QR
                  </button>
                  <button
                    type="button"
                    class="delete-btn"
                    data-key={item.key}
                    style={{ marginLeft: '6px' }}
                  >
                    Delete
                  </button>                 
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p style={{ marginTop: '10px' }}>
        <a href="/">Back to Home</a>
      </p>

      <p
        id="history-status"
        style={{ marginTop: '8px', fontSize: '0.8em', color: '#ccc' }}
      />

      {/* Client-side script for filters, copy, delete and QR actions */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function () {
            const statusEl = document.getElementById('history-status');
            const searchInput = document.getElementById('history-search');
            const fromInput = document.getElementById('history-from');
            const toInput = document.getElementById('history-to');
            const clearBtn = document.getElementById('history-clear-filters');
            const table = document.getElementById('history-table');

            function setStatus(msg) {
              if (!statusEl) return;
              statusEl.textContent = msg;
              if (msg) {
                setTimeout(() => { statusEl.textContent = ''; }, 2000);
              }
            }

            // Text + date filter (client-side only)
            function applyFilters() {
              if (!table) return;
              const text = (searchInput && searchInput.value || '').toLowerCase().trim();
              const fromVal = fromInput && fromInput.value ? new Date(fromInput.value) : null;
              const toVal = toInput && toInput.value ? new Date(toInput.value) : null;

              const tbody = table.querySelector('tbody');
              if (!tbody) return;
              const rows = Array.from(tbody.querySelectorAll('tr'));

              rows.forEach((tr) => {
                const tds = tr.getElementsByTagName('td');
                if (tds.length < 3) return;

                const createdAtText = tds[0].textContent || '';
                const originalText = (tds[1].textContent || '').toLowerCase();
                const shortText = (tds[2].textContent || '').toLowerCase();

                const matchesText =
                  !text ||
                  originalText.includes(text) ||
                  shortText.includes(text);

                let matchesDate = true;
                if (fromVal || toVal) {
                  const createdDate = new Date(createdAtText);
                  if (fromVal && createdDate < fromVal) {
                    matchesDate = false;
                  }
                  if (toVal) {
                    const toEnd = new Date(toVal);
                    toEnd.setDate(toEnd.getDate() + 1);
                    if (createdDate >= toEnd) {
                      matchesDate = false;
                    }
                  }
                }

                if (matchesText && matchesDate) {
                  tr.style.display = '';
                } else {
                  tr.style.display = 'none';
                }
              });
            }

            if (searchInput) {
              searchInput.addEventListener('input', applyFilters);
            }
            if (fromInput) {
              fromInput.addEventListener('change', applyFilters);
            }
            if (toInput) {
              toInput.addEventListener('change', applyFilters);
            }
            if (clearBtn) {
              clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (fromInput) fromInput.value = '';
                if (toInput) toInput.value = '';
                applyFilters();
              });
            }

            // Copy short URL to clipboard
            document.querySelectorAll('.copy-short-btn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-url');
                if (!url) return;
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                  } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = url;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                  }
                  setStatus('Short URL copied!');
                } catch (e) {
                  setStatus('Copy failed');
                }
              });
            });

            // Delete single row (KV key + history)
            document.querySelectorAll('.delete-btn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const key = btn.getAttribute('data-key');
                if (!key) return;
                if (!confirm('Delete this short URL?')) return;

                try {
                  const res = await fetch('/admin/history/delete/' + encodeURIComponent(key), {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });
                  if (!res.ok) {
                    setStatus('Delete failed');
                    return;
                  }
                  const tr = btn.closest('tr');
                  if (tr && tr.parentNode) {
                    tr.parentNode.removeChild(tr);
                  }
                  setStatus('Deleted');
                  applyFilters();
                } catch (e) {
                  setStatus('Delete error');
                }
              });
            });

            // Generate QR PNG blob for a given URL using external QR API
            async function generateQrPngBlob(url) {
              const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
              const resp = await fetch(apiUrl);
              if (!resp.ok) throw new Error('QR fetch failed');
              return await resp.blob();
            }

            function downloadBlob(blob, filename) {
              const blobUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(blobUrl);
            }

            // Copy QR to clipboard as PNG (fallback: download)
            document.querySelectorAll('.qr-copy-btn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-url');
                if (!url) return;
                try {
                  const blob = await generateQrPngBlob(url);
                  if (
                    navigator.clipboard &&
                    window.ClipboardItem &&
                    navigator.clipboard.write
                  ) {
                    const item = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([item]);
                    setStatus('QR copied!');
                  } else {
                    downloadBlob(blob, 'qr-code.png');
                    setStatus('Clipboard not supported, downloaded PNG');
                  }
                } catch (e) {
                  setStatus('QR copy failed');
                }
              });
            });

            applyFilters();
          })();
        `,
        }}
      />
    </div>
  )
})

// Generate unique key and store URL in KV
const createKey = async (kv: KVNamespace, url: string): Promise<string> => {
  const uuid = crypto.randomUUID()
  const key = uuid.substring(0, 6).toLowerCase()
  const result = await kv.get(key)
  if (!result) {
    await kv.put(key, url)
    return key
  } else {
    return await createKey(kv, url)
  }
}

// Create shortened URL + QR (SVG 200px) + copy & PNG buttons
app.post('/admin/create', csrf(), validator, async (c) => {
  try {
    const { url } = c.req.valid('form')
    const key = await createKey(c.env.KV, url)

    const shortenUrl = new URL(`/${key}`, c.req.url)
    const shortUrlStr = shortenUrl.toString()

    await addToHistory(c.env.KV, {
      key,
      url,
      createdAt: new Date().toISOString()
    })

    // Generate QR code as SVG
    const qrSvgRaw = await QRCode.toString(shortUrlStr, {
      type: 'svg',
      margin: 0
    })

    // Force 200x200 size on <svg>
    const qrSvg = qrSvgRaw.replace(
      '<svg',
      '<svg width="200" height="200"'
    )

    return c.render(
      <div>
        <h2>Created!</h2>

        {/* Short URL field */}
        <div style={{ marginBottom: '10px' }}>
          <input
            id="short-url"
            type="text"
            value={shortUrlStr}
            style={{
              width: '80%',
              padding: '6px 8px',
              backgroundColor: '#222',
              color: '#f5f5f5',
              border: '1px solid #555',
              borderRadius: '4px'
            }}
            readOnly
          />
        </div>

        {/* Buttons for URL and QR */}
        <div style={{ marginBottom: '20px' }}>
          <button id="copy-url-btn" type="button">
            Copy URL
          </button>
          <button
            id="copy-qr-btn"
            type="button"
            style={{ marginLeft: '10px' }}
          >
            Copy QR (PNG)
          </button>
          <span
            id="copy-status"
            style={{ marginLeft: '10px', fontSize: '0.9em' }}
          />
        </div>

        {/* QR code (SVG) */}
        <div style={{ marginTop: '10px' }}>
          <h3>QR Code:</h3>
          <div
            id="qr-container"
            style={{ width: '200px', height: '200px' }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>

        {/* Links */}
        <div style={{ marginTop: '10px' }}>
          <a href="/">Back to Home</a>
          <span> | </span>
          <a href="/admin/history">View history</a>
        </div>

        {/* Client-side script: copy URL, copy QR PNG, download QR PNG */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                const copyUrlBtn = document.getElementById('copy-url-btn');
                const copyQrBtn = document.getElementById('copy-qr-btn');
                const input = document.getElementById('short-url');
                const status = document.getElementById('copy-status');
                const qrContainer = document.getElementById('qr-container');
                if (!input || !qrContainer) return;

                // Copy URL button
                if (copyUrlBtn) {
                  copyUrlBtn.addEventListener('click', async () => {
                    const text = input.value;
                    try {
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text);
                      } else {
                        input.select();
                        document.execCommand('copy');
                      }
                      if (status) {
                        status.textContent = 'URL copied!';
                        setTimeout(() => (status.textContent = ''), 2000);
                      }
                    } catch (e) {
                      if (status) status.textContent = 'URL copy failed';
                    }
                  });
                }

                // Convert SVG → PNG (200x200) and return a Blob
                async function svgToPngBlob() {
                  const svgEl = qrContainer.querySelector('svg');
                  if (!svgEl) throw new Error('SVG not found');

                  const svgData = new XMLSerializer().serializeToString(svgEl);
                  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(svgBlob);

                  try {
                    const img = new Image();
                    const imgLoad = new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = reject;
                    });
                    img.src = url;
                    await imgLoad;

                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 200;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('No canvas context');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, 200, 200);

                    return await new Promise((resolve, reject) => {
                      canvas.toBlob((blob) => {
                        if (!blob) reject(new Error('PNG blob failed'));
                        else resolve(blob);
                      }, 'image/png');
                    });
                  } finally {
                    URL.revokeObjectURL(url);
                  }
                }

                // Download PNG helper
                function downloadPng(blob) {
                  const pngUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = pngUrl;
                  a.download = 'qr-code.png';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(pngUrl);
                }
                
                // Copy QR (PNG) to clipboard (with fallback to download)
                if (copyQrBtn) {
                  copyQrBtn.addEventListener('click', async () => {
                    try {
                      const blob = await svgToPngBlob();

                      if (
                        navigator.clipboard &&
                        window.ClipboardItem &&
                        navigator.clipboard.write
                      ) {
                        const item = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([item]);
                        if (status) {
                          status.textContent = 'QR copied to clipboard!';
                          setTimeout(() => (status.textContent = ''), 2000);
                        }
                      } else {
                        downloadPng(blob);
                        if (status) {
                          status.textContent = 'Clipboard not supported, downloaded PNG';
                          setTimeout(() => (status.textContent = ''), 2000);
                        }
                      }
                    } catch (e) {
                      if (status) status.textContent = 'QR copy failed';
                    }
                  });
                }
              })();
            `,
          }}
        />
      </div>
    )
  } catch (e) {
    console.error('Error in /admin/create handler:', e)
    throw e // Let global error handler catch this
  }
})

// Delete single entry (KV key + history)
app.post('/admin/history/delete/:key', csrf(), async (c) => {
  const key = c.req.param('key')
  try {
    await c.env.KV.delete(key)
    await removeFromHistory(c.env.KV, key)
    return c.json({ ok: true })
  } catch (e) {
    console.error('Error deleting key from history:', e)
    return c.json({ ok: false, error: 'delete-failed' }, 500)
  }
})

// Global error handler for generic 500 errors (no links, just redirect)
app.onError((err, c) => {
  console.error('Unhandled error:', err)

  return c.html(
    `
      <html>
        <head>
          <title>Page not found</title>
          <meta charset="utf-8" />
        </head>
        <body style="background:#000;color:#fff;font-family:sans-serif;">
          <div style="max-width:600px;margin:60px auto;text-align:center;">
            <h2>Page not found</h2>
            <p>An unexpected error occurred or the page you requested is not available.</p>
            <p>You will be redirected shortly to iasociety.org.</p>
          </div>
          <script>
            setTimeout(function () {
              window.location.href = 'https://www.iasociety.org';
            }, 10000);
          </script>
        </body>
      </html>
    `,
    500
  )
})

export default app
