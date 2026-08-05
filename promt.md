# Codex Handoff Prompt

Date: 2026-08-03

## User Prompt

The whatsapp and signal is still not working pls fix it for every user also when user disconnect then it should be disconnect from there account currenlty last connected account still connected after click on connect button which is wrong if user click on disconnect then it should completely disconnected from their account so from next time user can connect other whatsapp or signal account as well. Pls fix this and test before every changes.
Also From now pls creat a promt.md file in root of the project and write given prompt so next prompt can help codex which things changed in previous cmd.

## Changes Made In This Command

- Added `logoutAllLogins(network, mxid)` and `clearBridgeAccountState(network, mxid)` to `backend/services/bridgeProvisioningLogin.js`.
- WhatsApp and Signal fresh/force connect now call the bridge Provisioning API logout first, before starting a new QR flow. This prevents the old linked account from being treated as connected when the user clicks Connect again.
- WhatsApp and Signal disconnect routes now call Provisioning API logout first, then keep the existing Matrix-command fallback, then remove the Orion Integration row and invalidate reconnect caches.
- Fresh connect now forces the QR runner after cleanup, so a surviving bridge login cannot short-circuit back to the old account.
- Focused backend Matrix tests, route syntax checks, live no-op provisioning logout checks, and frontend build passed.

## Important Context From Previous Command

- Signal appservice registration was fixed to use `sender_localpart: signalbot`.
- Hidden Matrix account recovery was added using Synapse shared-secret registration/admin fallback because the configured `MATRIX_ADMIN_ACCESS_TOKEN` can be stale after a fresh Synapse reset.
- WhatsApp status was verified connected for user `vikasposhn` with phone `+919870291255`.
- Signal status was verified reaching `pending_qr` with a QR image for user `vikasverma`.
