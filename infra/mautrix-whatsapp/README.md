# mautrix-whatsapp for OrionAI

This folder mirrors the local Signal bridge setup and is meant to keep the WhatsApp bridge fully hidden behind OrionAI.

## Local values already wired

- Synapse homeserver: `http://synapse:8008`
- Matrix domain: `orion.local`
- Bridge appservice URL: `http://mautrix-whatsapp:29318`
- Bot MXID: `@whatsappbot:orion.local`
- SQLite DB: `file:/data/mautrix-whatsapp.db?_txlock=immediate`

## Recommended setup flow

1. The checked-in [`config.yaml`](./config.yaml) and [`registration.yaml`](./registration.yaml) are a bootstrap baseline for local OrionAI work. If you want a fresh template from the current bridge image, generate it in an empty temporary folder:

```bash
mkdir -p /tmp/mautrix-whatsapp-bootstrap
cd /tmp/mautrix-whatsapp-bootstrap
docker run --rm \
  -v "$PWD:/data" \
  dock.mau.dev/mautrix/whatsapp:latest
```

2. Edit the generated `/tmp/mautrix-whatsapp-bootstrap/config.yaml` with the OrionAI-local values from [`config.yaml`](./config.yaml). The Docker image writes the default files to `/data/config.yaml` and `/data/registration.yaml`, and it only generates them when they do not already exist.

3. Run the same command again to generate/update the appservice registration after the config is in place:

```bash
cd /tmp/mautrix-whatsapp-bootstrap
docker run --rm \
  -v "$PWD:/data" \
  dock.mau.dev/mautrix/whatsapp:latest
```

4. Copy the generated registration into Synapse appservices:

```bash
cp /tmp/mautrix-whatsapp-bootstrap/registration.yaml /Users/apple/Desktop/ai-knowledge-assistant/infra/synapse/appservices/mautrix-whatsapp-registration.yaml
```

5. Restart Synapse so it loads the WhatsApp appservice registration:

```bash
docker compose restart synapse
```

6. Start the WhatsApp bridge:

```bash
docker compose up -d mautrix-whatsapp
```

7. If you changed both Synapse and the bridge config, restart both:

```bash
docker compose up -d synapse mautrix-whatsapp
```

## Notes

- Keep the permissions block small for local use:
  - `"*": relay`
  - `"orion.local": user`
  - `"@vikas:orion.local": admin` unless your admin MXID is different
- The checked-in files are a bootstrap baseline for OrionAI local development. The generated template from the bridge image remains the source of truth if the bridge image updates its config schema.
- Because the Docker startup script only generates missing files, use an empty folder when you want a fresh template from the image instead of mounting the already-populated `infra/mautrix-whatsapp` directory.
- If Docker prints an error like `exec: "-g": executable file not found in $PATH`, it means the image is being asked to execute `-g` as the command. Use the plain `docker run ... dock.mau.dev/mautrix/whatsapp:latest` form above instead of appending raw bridge flags.
- No Matrix credentials should ever be shown in the OrionAI frontend. OrionAI provisions and stores the hidden Matrix session server-side.
