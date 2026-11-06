# Telecom protocol attribution

The Node.js implementations in `server/src/upstream/telecom-node.js` and
`telecom-node-query.js` are ports/adaptations of these MIT-licensed sources:

- https://github.com/hlhk2017/ChinaTelecomMonitor-Homeassistant-Integration
  - Commit: a01ab8b85e95ab5a3c42672bd4c4b04d1a9ea134
  - File: custom_components/china_telecom/telecom_class.py
  - License: hlhk-LICENSE
- https://github.com/margrop/telecom-phone-device-id-tools
  - Commit: 429fece2e25a8a90d172c2cb285c91be23a12874
  - File: tools/telecom_auth/telecom.py
  - License: device-auth-LICENSE

No interpreter or original Python sources are shipped. Fixed synthetic protocol
vectors in `server/test/fixtures/telecom-auth-vectors.json` were generated from
those revisions with network calls mocked. They contain no real credentials.
RSA public keys and application-level source identifiers are protocol constants.
