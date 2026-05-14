FROM kalilinux/kali-rolling
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=en_US.UTF-8
ENV LC_ALL=C.UTF-8
ENV LANGUAGE=en_US.UTF-8
ENV TERM=xterm-256color

# ── 1. Core system utilities ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl wget git nano vim less locales \
    procps htop lsof strace tmux screen \
    zip unzip tar gzip bzip2 p7zip-full \
    grep sed gawk jq bc file binutils \
    ca-certificates gnupg apt-transport-https \
    iproute2 iptables ipset \
    man-db \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# ── 2. Network & recon tools ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap masscan \
    netcat-traditional netcat-openbsd socat ncat \
    whois dnsutils dnsrecon dnsenum \
    net-tools iputils-ping traceroute arping \
    tcpdump tshark wireshark-common \
    openssh-client openssl \
    hping3 \
    arp-scan \
    && rm -rf /var/lib/apt/lists/*

# ── 3. Web application testing ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    gobuster dirb dirbuster \
    nikto \
    wfuzz \
    whatweb \
    wafw00f \
    sqlmap \
    ffuf \
    sslscan \
    sslyze \
    && rm -rf /var/lib/apt/lists/*

# ── 4. Password attacks ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    hydra medusa ncrack \
    john \
    hashcat \
    crunch \
    cewl \
    ophcrack \
    && rm -rf /var/lib/apt/lists/*

# ── 5. Exploitation framework ─────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    metasploit-framework \
    exploitdb \
    && rm -rf /var/lib/apt/lists/*

# ── 6. SMB / Active Directory / Network services ─────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    smbclient smbmap \
    enum4linux \
    ldap-utils \
    snmp snmpcheck \
    onesixtyone \
    nbtscan \
    responder \
    && rm -rf /var/lib/apt/lists/*

# ── 7. Wireless (CLI tools) ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    aircrack-ng \
    reaver \
    pixiewps \
    bully \
    && rm -rf /var/lib/apt/lists/*

# ── 8. Forensics & reverse engineering ───────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    binwalk \
    foremost \
    volatility3 \
    steghide \
    exiftool \
    strings \
    ltrace strace \
    gdb \
    && rm -rf /var/lib/apt/lists/*

# ── 9. Python 3 + hacking libraries ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev python3-setuptools \
    && pip3 install --break-system-packages \
        impacket \
        pwntools \
        scapy \
        requests \
        beautifulsoup4 \
        paramiko \
        cryptography \
        colorama \
        python-nmap \
        shodan \
        dnspython \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# ── 10. Ruby + gem tools ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ruby ruby-dev \
    && gem install wpscan 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# ── 11. Go-based tools ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends golang-go \
    && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest 2>/dev/null || true \
    && go install github.com/tomnomnom/httprobe@latest 2>/dev/null || true \
    && go install github.com/tomnomnom/waybackurls@latest 2>/dev/null || true \
    && go install github.com/OJ/gobuster/v3@latest 2>/dev/null || true \
    && cp /root/go/bin/* /usr/local/bin/ 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/* /root/go/pkg

# ── 12. Wordlists ─────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    wordlists \
    seclists \
    && gunzip /usr/share/wordlists/rockyou.txt.gz 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# ── 13. Misc extra tools ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    theharvester \
    fierce \
    dmitry \
    maltego-teeth \
    netdiscover \
    macchanger \
    proxychains4 \
    tor \
    && rm -rf /var/lib/apt/lists/*

# ── 14. Strip file capabilities from nmap so it executes on seccomp-restricted hosts ──
RUN setcap -r /usr/lib/nmap/nmap 2>/dev/null || true \
    && setcap -r /usr/bin/nmap      2>/dev/null || true

# ── 15. Node.js 20 ───────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── 16. App ───────────────────────────────────────────────────────────────────
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --build-from-source
COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
