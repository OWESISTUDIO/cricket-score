// Live sync between the scorer phone and the overlay, through two free public
// MQTT brokers at once (if one is down the other still carries the score).
// Messages are "retained", so an overlay that opens late gets the last score.
(function () {
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
  ];

  function topicOf(code) {
    return "owesi-cricket/" + code + "/score";
  }

  function connectAll(onStatus) {
    return BROKERS.map((url, i) => {
      const c = mqtt.connect(url, {
        clientId: "cs_" + Math.random().toString(36).slice(2, 12),
        reconnectPeriod: 2000,
        connectTimeout: 8000,
        clean: true,
      });
      c.on("connect", () => onStatus && onStatus(i, true));
      c.on("close", () => onStatus && onStatus(i, false));
      c.on("offline", () => onStatus && onStatus(i, false));
      c.on("error", () => {});
      return c;
    });
  }

  window.CricSync = {
    // Scorer: publish(view) sends the newest score; older unsent ones are dropped.
    publisher(code, onStatus) {
      const clients = connectAll(onStatus);
      const topic = topicOf(code);
      let last = null;
      clients.forEach((c) =>
        c.on("connect", () => {
          if (last) c.publish(topic, last, { qos: 1, retain: true });
        })
      );
      return {
        publish(obj) {
          last = JSON.stringify(obj);
          clients.forEach((c) => {
            if (c.connected) c.publish(topic, last, { qos: 1, retain: true });
          });
        },
        anyConnected() {
          return clients.some((c) => c.connected);
        },
      };
    },
    // Overlay: calls onView with the newest score from whichever broker has it.
    subscriber(code, onView, onStatus) {
      const clients = connectAll(onStatus);
      const topic = topicOf(code);
      let newest = 0;
      clients.forEach((c) => {
        c.on("connect", () => c.subscribe(topic, { qos: 1 }));
        c.on("message", (_t, buf) => {
          try {
            const v = JSON.parse(buf.toString());
            if (!v || typeof v.seq !== "number") return;
            // Both brokers deliver the same update; seq is a timestamp,
            // so keep only the newer one.
            if (v.seq <= newest) return;
            newest = v.seq;
            onView(v);
          } catch (e) {}
        });
      });
    },
  };
})();
