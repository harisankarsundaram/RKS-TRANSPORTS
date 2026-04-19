FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
	&& for i in 1 2 3; do pip install --no-cache-dir --default-timeout=120 -r requirements.txt && break || (echo "pip install failed, retry ${i}" && sleep 5); done

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
