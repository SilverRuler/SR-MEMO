# Node.js LTS 가벼운 이미지 사용
FROM node:20-alpine

# 앱 디렉토리 생성
WORKDIR /usr/src/app

# 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm install --production

# 앱 소스 복사 (firebase-key.json 포함)
COPY . .

# API 및 UI 포트 노출
EXPOSE 6000 6001

# 앱 실행
CMD [ "node", "index.js" ]
