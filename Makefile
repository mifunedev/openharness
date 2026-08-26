
-include .devcontainer/.env

COMPOSE           := .oh/scripts/docker-compose.sh

SANDBOX_NAME      := $(or $(SANDBOX_NAME),openharness)

SHELL_USER        ?= sandbox
SHELL_CONTAINER ?= $(SANDBOX_NAME)
ifeq ($(firstword $(MAKECMDGOALS)),shell)
  SHELL_POS_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  ifneq ($(SHELL_POS_ARGS),)
    SHELL_CONTAINER := $(firstword $(SHELL_POS_ARGS))
    $(foreach a,$(SHELL_POS_ARGS),$(eval $a:;@:))
  endif
endif

ifeq ($(firstword $(MAKECMDGOALS)),gateway)
  GATEWAY_ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(foreach a,$(GATEWAY_ARGS),$(eval $a:;@:))
endif

.DEFAULT_GOAL := help

.PHONY: sandbox shell destroy stop logs ps restart config help gateway

sandbox: ## Provision and start the sandbox
	$(COMPOSE) up -d --build

shell: ## Connect to a running container (default: $(SANDBOX_NAME)). Usage: make shell [container] [SHELL_USER=user]
	docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh

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

gateway: ## Start a messaging client session: make gateway <pi|hermes> (flags/--stop via the script)
	@bash .oh/scripts/gateway.sh $(GATEWAY_ARGS)

config: ## Print the resolved compose config (.devcontainer/.env is the only config surface)
	$(COMPOSE) config

help: ## List available targets with descriptions
	@printf "Open Harness — Make targets:\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nSame verbs via the \033[36moh\033[0m CLI (inside the sandbox, or in an \033[36moh init\033[0m repo):\n"
	@printf "  \033[36moh sandbox\033[0m / \033[36mshell\033[0m / \033[36mstop\033[0m / \033[36mrestart\033[0m / \033[36mlogs\033[0m / \033[36mps\033[0m / \033[36mgateway\033[0m\n"
	@printf "  Both run .oh/scripts/docker-compose.sh. Mapping: \033[36m.oh/docs/lifecycle-commands.md\033[0m\n"
	@printf "  \033[36moh --help\033[0m  List all \033[36moh\033[0m subcommands\n"
	@printf "  Slack bridge setup: see \033[36m.oh/docs/integrations/slack.md\033[0m\n"
