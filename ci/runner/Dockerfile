# Actions runner image (arm64) carrying kubectl + ansible.
FROM debian:bookworm-slim
ARG RUNNER_VERSION=2.319.1
ARG KUBECTL_VERSION=v1.31.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates jq git sudo tar gzip libicu72 \
      python3 python3-pip openssh-client \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/arm64/kubectl" \
    && chmod +x /usr/local/bin/kubectl

RUN pip3 install --no-cache-dir --break-system-packages ansible-core

RUN useradd -m runner
WORKDIR /home/runner
RUN curl -fsSL -o actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
    && tar xzf actions-runner.tar.gz && rm actions-runner.tar.gz \
    && ./bin/installdependencies.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R runner:runner /home/runner
USER runner
ENTRYPOINT ["/entrypoint.sh"]
