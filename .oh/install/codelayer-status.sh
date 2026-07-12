#!/bin/sh
# Source this file from banner.sh. Installation is not authentication.
codelayer_status="$status_x"
codelayer_detail="not installed — set install.codelayer: true (or INSTALL_CODELAYER=true) and rebuild"
if command -v codelayer >/dev/null 2>&1; then
  if timeout 10 codelayer --help >/dev/null 2>&1; then
    codelayer_status="$status_ok"
    codelayer_detail="installed — provider authentication is not verified"
  else
    codelayer_status="$status_x"
    codelayer_detail="installed but local help failed — rebuild or disable install.codelayer"
  fi
fi
