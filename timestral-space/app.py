"""Actual Mistral Timestral-5M zero-shot price forecasting model, CPU-served."""
import os
import time
from functools import lru_cache
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

MODEL_NAME = 'mistralai/Timestral-5M'
app = FastAPI(title='BTC Timestral inference', version='1.0')
allowed = os.environ.get('ALLOWED_ORIGINS', 'https://tbenitz.github.io,http://localhost:8000,http://127.0.0.1:8000').split(',')
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in allowed], allow_methods=['GET','POST'], allow_headers=['Content-Type'])

class Request(BaseModel):
    series: list[float] = Field(min_length=64, max_length=300)
    steps: Literal[12, 24, 28]

    @field_validator('series')
    @classmethod
    def validate_prices(cls, series):
        if not all(np.isfinite(v) and v > 0 for v in series):
            raise ValueError('History must contain finite positive BTC prices')
        return series

@lru_cache(maxsize=1)
def model():
    from timestral import TimestralForecaster
    return TimestralForecaster.from_pretrained(MODEL_NAME, device='cpu')

@app.get('/health')
def health():
    return {'status': 'ready' if model.cache_info().currsize else 'cold', 'model': MODEL_NAME}

@app.post('/forecast')
def forecast(req: Request):
    start = time.monotonic()
    try:
        output = model().forecast(np.asarray(req.series, dtype=np.float32), prediction_length=req.steps)
        median = output.median.reshape(-1).tolist()
        q10 = output.quantile(0.1).reshape(-1).tolist()
        q90 = output.quantile(0.9).reshape(-1).tolist()
        if not all(np.isfinite(v) for v in median+q10+q90):
            raise ValueError('Non-finite output')
        return {'model':MODEL_NAME, 'median':median, 'q10':q10, 'q90':q90,
                'elapsed_ms':int((time.monotonic()-start)*1000), 'observations':len(req.series)}
    except Exception as exc:
        raise HTTPException(status_code=503, detail='Timestral inference unavailable: '+type(exc).__name__) from exc
