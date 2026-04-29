# Usando a imagem base do Ubuntu 22.04
FROM ubuntu:22.04

# Atualizando pacotes e instalando dependências básicas
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*

# Instalando Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g yarn

# Configurando Android SDK
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools
RUN curl -o sdk-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip \
    && unzip sdk-tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm sdk-tools.zip

# Aceitando licenças do Android SDK e instalando ferramentas necessárias
RUN yes | sdkmanager --licenses \
    && sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"

# Instalando Expo CLI globalmente
# RUN npm install -g expo-cli

# Definindo diretório de trabalho
WORKDIR /app

# Expondo porta padrão do Expo
EXPOSE 19000

# Comando padrão para rodar o projeto
CMD ["bash"]