FROM grafana/k6:latest
COPY load-24h.js /scripts/load-24h.js
ENTRYPOINT ["k6", "run", "/scripts/load-24h.js"]
