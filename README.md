# tbyaan_uat

UAT (User Acceptance Testing) environment for the Tbyaan AI Agent project.

## Overview

This repository contains the UAT version of the GSBPM LangGraph Agent — an LLM-powered system that automates the creation of bilingual statistical indicator metadata following the Generic Statistical Business Process Model (GSBPM).

## Getting Started

```bash
# Clone the repository
git clone https://github.com/usman13581/tbyaan_uat.git
cd tbyaan_uat

# Create virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate
pip install -e .

# Configure environment
cp .env.example .env
# Edit .env with your LLM provider settings
```

## Running the Application

```bash
# Start the FastAPI server
uvicorn gsbpm_agent.server:app --reload
```

## Environment

This is the **UAT** environment. For production, refer to the main project repository.
