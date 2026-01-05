#!/bin/bash
cd /home/kavia/workspace/code-generation/simple-arithmetic-calculator-40998-41007/calculator_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

