# Cricket live scoreboard

- `index.html`: scorer, opened on a phone.
- `overlay.html?t=<code>`: the broadcast bar, added as a web widget in Streamlabs.
- Live sync goes through the free public MQTT brokers (EMQX and HiveMQ), using retained messages.
