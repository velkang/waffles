interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/health"))
      return env.API.fetch(request);
    const response = await env.ASSETS.fetch(request);
    const mint = url.pathname.match(
      /^\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})$/,
    )?.[1];
    if (!mint || !response.headers.get("Content-Type")?.includes("text/html"))
      return response;
    const data = await env.API.fetch(
      new Request(`${url.origin}/v1/launches/${mint}`),
    );
    if (!data.ok) return response;
    const { launch } = (await data.json()) as {
      launch: {
        name: string;
        symbol: string;
        description: string;
        imageUri: string;
      } | null;
    };
    if (!launch) return response;
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    return new HTMLRewriter()
      .on("title", {
        element(e) {
          e.setInnerContent(`${launch.name} · waffles.meme`);
        },
      })
      .on("head", {
        element(e) {
          e.append(
            `<meta property="og:title" content="${escape(launch.name)}"><meta property="og:description" content="${escape(launch.description)}">`,
            { html: true },
          );
          if (launch.imageUri.startsWith("https://"))
            e.append(
              `<meta property="og:image" content="${escape(launch.imageUri)}">`,
              { html: true },
            );
        },
      })
      .transform(response);
  },
} satisfies ExportedHandler<Env>;
