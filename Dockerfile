FROM kalilinux/kali-rolling
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    bash curl wget git nano vim less man-db \
    python3 python3-pip python3-venv \
    nmap whois dnsutils net-tools iputils-ping \
    netcat-traditional traceroute tcpdump \
    zip unzip tar gzip bzip2 \
    grep sed gawk jq bc \
    htop procps lsof strace \
    openssh-client \
    build-essential python3-dev \
    ca-certificates gnupg \
    iproute2 iptables \
    tmux screen \
    file binutils \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --build-from-source
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
