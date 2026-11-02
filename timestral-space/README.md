---
title: BTC Timestral 5M API
emoji: 📈
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
models:
  - mistralai/Timestral-5M
---

# BTC Timestral-5M Model API

The real **Mistral Timestral-5M** model runs on CPU here. It emits its 10th percentile, median and 90th percentile forecasts. It has not been retrained on Bitcoin.

**Deploying:** At Hugging Face, create a **new Docker Space** and put `app.py`, `Dockerfile`, and `README.md` from this folder **in that Space's root**. After its build succeeds, enter `https://YOURNAME-YOURSPACE.hf.space` into Forecast Settings on the Bitcoin Risk Sentinel site. The first call can be slow while the 21MB checkpoint downloads; an idle free Space can also sleep. If the model endpoint is absent, BTC market data and DeepSeek sentiment remain independent.

`POST /forecast`: `{"series":[64 to 300 historical BTC closing prices],"steps":24}`. Returns `median`, `q10`, `q90`, `model`, `elapsed_ms`. `GET /health` is available.

This public endpoint exposes CPU work without authentication. Review Space limits; don't assume hosted GPU or unlimited access. The model weights use Mistral's Modified MIT license; the upstream Python inference package uses Apache-2.0. Source: https://github.com/mistralai/timestral ; demo inspiration: https://huggingface.co/spaces/townbox/sketch-a-series .
