FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir fastapi 'uvicorn[standard]' numpy safetensors huggingface_hub 'pydantic>=2' 'git+https://github.com/mistralai/timestral.git'
RUN useradd -m -u 1000 user
ENV HOME=/home/user HF_HOME=/home/user/.cache/huggingface
WORKDIR /app
COPY --chown=user:user app.py /app/app.py
USER user
EXPOSE 7860
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","7860"]
