# Open Harness — Makefile
# Override sandbox name: make shell SANDBOX_NAME=mycontainer

-include .devcontainer/.env

SANDBOX_NAME ?= openharness
COMPOSE      := docker compose -f .devcontainer/docker-compose.yml

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart help

sandbox: ## Provision and start the sandbox
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
