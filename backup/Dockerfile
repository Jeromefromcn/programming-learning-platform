FROM mysql:8.0

RUN apt-get update && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

RUN echo "0 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" \
    > /etc/cron.d/backup && chmod 0644 /etc/cron.d/backup

RUN touch /var/log/backup.log

CMD ["cron", "-f"]
