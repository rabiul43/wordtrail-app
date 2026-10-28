# wordtrail-scene (free AI for unclear paragraphs)

A tiny Cloudflare Worker. The app sends it ONE unclear paragraph; it asks a free Workers AI model and answers with the place, weather, time and mood.

## Put it online (about 5 minutes, free)

1. Open the Cloudflare dashboard: **Workers & Pages** > **Create** > **Create Worker**. Name it `wordtrail-scene`, press **Deploy**.
2. Press **Edit code**, delete what is there, paste the whole of `index.js` from this folder, press **Deploy**.
3. In the Worker: **Settings** > **Bindings** > **Add** > **Workers AI**. Variable name: `AI`. Save and deploy.
4. At the top of `index.js`, check that the address in `ALLOWED` is the address of your app (the one in your browser bar). Change it if not, and deploy again.
5. In the app: open the **Sound** mixer, go to the **Sound effects** tab, and turn on **Ask a free AI when unsure**.

If you prefer the command line: `cd tools/scene-ai-worker`, then `npx wrangler deploy`.

If your Worker has another name or address, change `scene` in `hosts.json` (leave it empty to switch the free AI off), then run `python build.py`.

## Check that it answers

```
curl -X POST https://wordtrail-scene.YOURNAME.workers.dev -H "Origin: https://wordtrail.YOURNAME.workers.dev" -H "Content-Type: application/json" -d "{\"t\":\"The rain beat on the cottage roof all night, and the old man sat by the fire, listening to the wind in the chimney.\",\"p\":[\"forest\",\"hearth\",\"sea\"],\"w\":[\"rain\",\"storm\"],\"m\":[\"dread\",\"peace\"]}"
```

You should get something like `{"p":"hearth","w":"rain","t":"night","m":"peace"}`.

## Limits

- Cloudflare gives your account 10,000 free "neurons" a day for all Workers AI use, reset at 00:00 UTC. One paragraph costs about 3, so about 3,000 paragraphs a day for all your readers together. When it is used up, the Worker answers with an error and the app simply uses its normal rules until the reset.
- Each device asks at most 120 times a day (`AI_DAY` in `233-scene-chapters-label.js`) and waits 15 minutes after a failed call.
- Nothing is stored in the Worker.
