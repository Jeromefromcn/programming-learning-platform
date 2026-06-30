FROM mysql:8.0

RUN microdnf install -y cronie && microdnf clean all

COPY backup.sh /usr/local/bin/backup.sh
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/docker-entrypoint.sh

RUN echo "0 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" \
    > /etc/cron.d/backup && chmod 0644 /etc/cron.d/backup

RUN touch /var/log/backup.log

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["crond", "-n"]
