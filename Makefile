# Open Harness — Makefile
# Override sandbox name: make shell SANDBOX_NAME=mycontainer

-include .devcontainer/.env

SANDBOX_NAME      ?= openharness
COMPOSE_BASE      := -f .devcontainer/docker-compose.yml
COMPOSE_OVERRIDES := $(shell jq -r '.composeOverrides[]?' \
    config.json 2>/dev/null | sed 's|^|-f |' | tr '\n' ' ')
COMPOSE           := docker compose $(COMPOSE_BASE) $(COMPOSE_OVERRIDES)

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart help _check-jq _check-config

_check-jq:
	@command -v jq >/dev/null 2>&1 || { \
	  echo "ERROR: jq is required to expand config.json composeOverrides."; \
	  echo "Install jq (e.g. apt install jq, brew install jq) and re-run."; \
	  exit 1; }

_check-config:
	@[ -f config.json ] || { \
	  echo "ERROR: config.json missing. Run scripts/install.sh, OR: cp config.example.json config.json"; \
	  exit 1; }

sandbox: _check-jq _check-config ## Provision and start the sandbox
	$(COMPOSE) up -d --build

shell: ## Connect to the sandbox (agent choice happens inside)
	docker exec -it -u sandbox $(SANDBOX_NAME) zsh

destroy: ## Stop and remove the sandbox (volumes wiped)
	$(COMPOSE) down -v

stop: ## Stop the sandbox, preserving volumes for later restart
	$(COMPOSE) stop

logs: ## Tail compose logs
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

restart: ## Restart the service
	$(COMPOSE) restart

help: ## List available targets with descriptions
	@printf "Open Harness — Make targets:\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
