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
    hping3 arp-scan \
    && rm -rf /var/lib/apt/lists/*

# ── 3. Web application testing ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    gobuster dirb nikto wfuzz whatweb wafw00f sqlmap ffuf sslscan \
    && rm -rf /var/lib/apt/lists/*

# ── 4. Password attacks ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    hydra medusa ncrack john hashcat crunch cewl \
    && rm -rf /var/lib/apt/lists/*

# ── 5. Exploitation framework ─────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    metasploit-framework exploitdb \
    && rm -rf /var/lib/apt/lists/*

# ── 6. SMB / AD / network services ───────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    smbclient smbmap enum4linux ldap-utils \
    snmp onesixtyone nbtscan responder \
    && rm -rf /var/lib/apt/lists/*

# ── 7. Wireless (CLI only) ────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    aircrack-ng reaver pixiewps \
    && rm -rf /var/lib/apt/lists/*

# ── 8. Forensics & reverse engineering ───────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    binwalk foremost steghide libimage-exiftool-perl ltrace gdb \
    && rm -rf /var/lib/apt/lists/*

# ── 9. OSINT / misc ───────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    theharvester fierce dmitry netdiscover macchanger proxychains4 tor \
    && rm -rf /var/lib/apt/lists/*

# ── 10. Wordlists ─────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    wordlists seclists \
    && gunzip /usr/share/wordlists/rockyou.txt.gz 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# ── 11. Python 3 + hacking libraries ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev python3-setuptools build-essential cmake \
    && pip3 install --break-system-packages "unicorn==2.0.1.post1" \
    && for p in impacket pwntools volatility3 scapy requests beautifulsoup4 paramiko cryptography colorama python-nmap shodan dnspython sslyze; do \
        pip3 install --break-system-packages "$p" 2>/dev/null || echo "[warn] pip install failed: $p"; \
    done \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# ── 12. Ruby + wpscan ─────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ruby ruby-dev \
    && gem install wpscan 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/*

# ── 13. Go-based tools ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends golang-go \
    && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest 2>/dev/null || true \
    && go install github.com/tomnomnom/httprobe@latest                    2>/dev/null || true \
    && go install github.com/tomnomnom/waybackurls@latest                 2>/dev/null || true \
    && cp /root/go/bin/* /usr/local/bin/ 2>/dev/null || true \
    && rm -rf /var/lib/apt/lists/* /root/go/pkg

# ── 14. Fix tools for unprivileged Docker (Render has no NET_RAW/NET_ADMIN) ──
# Strip file capabilities from any binary that has them, then wrap nmap so it
# always runs in --unprivileged mode (TCP-connect scan instead of raw sockets).
RUN for bin in /usr/lib/nmap/nmap /usr/bin/nmap /usr/bin/hping3 \
               /usr/bin/arping /usr/sbin/arping \
               /usr/bin/tcpdump /usr/bin/dumpcap; do \
      setcap -r "$bin" 2>/dev/null || true; \
      chmod u-s  "$bin" 2>/dev/null || true; \
    done \
    && printf '#!/bin/bash\nexec /usr/lib/nmap/nmap --unprivileged "$@"\n' \
         > /usr/bin/nmap \
    && chmod +x /usr/bin/nmap

# ── 14a. Always-on Tor: proxychains4 routes every shell connection through tor ──
RUN printf 'strict_chain\nquiet_mode\nproxy_dns\ntcp_read_time_out 15000\ntcp_connect_time_out 8000\nlocalnet 127.0.0.0/255.0.0.0\n[ProxyList]\nsocks5 127.0.0.1 9050\n' > /etc/proxychains4.conf \
    && printf '#!/bin/sh\n# Pull uncensored local models (needs RAM \xe2\x80\x94 upgrade the plan first)\nollama pull dolphin-mistral:7b\nollama pull dolphin-llama3:8b\nollama pull wizard-vicuna-uncensored:7b\n' > /usr/local/bin/llm-pull \
    && chmod +x /usr/local/bin/llm-pull

# ── 14b. Extra tools (premium update) ────────────────────────────────────────
RUN apt-get update && for t in feroxbuster netexec nuclei sherlock amass httpie testssl.sh theharvester fastfetch figlet zsh bettercap hcxtools hcxdumptool wifite sudo iw wireless-tools wpasupplicant reaver pixiewps bully cowpatty hashcat hostapd mdk4 ethtool; do \
    apt-get install -y --no-install-recommends "$t" 2>/dev/null || echo "[warn] apt install failed: $t"; \
    done \
    && apt-get clean

# ── 14c. Ollama runtime (local LLMs; models pull at runtime) ─────────────────
RUN (set -e; curl -fsSL https://ollama.com/download/ollama-linux-amd64.tgz -o /tmp/ol.tgz \
    && tar -xzf /tmp/ol.tgz -C /usr \
    && chmod +x /usr/bin/ollama \
    && rm -f /tmp/ol.tgz) \
    || echo "[warn] ollama install skipped"

# ── 15. Node.js 20 ───────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs build-essential \
    && rm -rf /var/lib/apt/lists/*

# ── 16. App ───────────────────────────────────────────────────────────────────
WORKDIR /app
COPY package.json ./
RUN npm install --build-from-source
COPY . .

EXPOSE 5000
# sudo: passwordless, works everywhere
RUN echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner && chmod 440 /etc/sudoers.d/runner || true

CMD ["/bin/bash", "start.sh"]
