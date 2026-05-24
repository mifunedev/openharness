# Open Harness — Makefile
# Override sandbox name: make shell SANDBOX_NAME=mycontainer
# Connect to a non-default service: make shell postgres
# Connect as a specific user: make shell postgres SHELL_USER=postgres

-include .devcontainer/.env

SANDBOX_NAME      ?= openharness
SHELL_USER        ?= sandbox
COMPOSE_BASE      := -f .devcontainer/docker-compose.yml
# Base ships with no required overlays. Downstream packs (Pi extensions,
# BYO harness packs) register their own by appending paths to
# composeOverrides[] in config.json; jq is only invoked when both jq and
# config.json are present.
COMPOSE_OVERRIDES := $(shell command -v jq >/dev/null 2>&1 && [ -f config.json ] && \
    jq -r '.composeOverrides[]?' config.json 2>/dev/null | sed 's|^|-f |' | tr '\n' ' ')
COMPOSE           := docker compose $(COMPOSE_BASE) $(COMPOSE_OVERRIDES)

SHELL_SERVICE ?= sandbox
ifeq ($(firstword $(MAKECMDGOALS)),shell)
  SHELL_POS_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(SHELL_POS_ARGS),)
    SHELL_SERVICE := $(firstword $(SHELL_POS_ARGS))
    $(foreach a,$(SHELL_POS_ARGS),$(eval $a:;@:))
  endif
endif

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart help

sandbox: ## Provision and start the sandbox
	$(COMPOSE) up -d --build

shell: ## Connect to a compose service shell (default: sandbox). Usage: make shell [service] [SHELL_USER=user]
	$(COMPOSE) exec -u $(SHELL_USER) $(SHELL_SERVICE) zsh

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
	@printf "\nConfiguration wizards (run \033[36minside\033[0m the sandbox after \033[36mmake shell\033[0m):\n"
	@printf "  \033[36moh config slack\033[0m  Slack integration setup wizard\n"
	@printf "  \033[36moh --help\033[0m         List all \033[36moh\033[0m subcommands\n"
