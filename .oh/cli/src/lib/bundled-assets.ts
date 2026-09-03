import composeRepo from "../../../../.devcontainer/docker-compose.yml";
import composeImageOnly from "../../../../.devcontainer/docker-compose.image-only.yml";
import composeSsh from "../../../../.devcontainer/docker-compose.ssh.yml";
import composeDockerSock from "../../../../.devcontainer/docker-compose.docker-sock.yml";
import composeWrapper from "../../../scripts/docker-compose.sh";
import checkHostPort from "../../../scripts/check-host-port.sh";

export const COMPOSE_BASE_REPO: string = composeRepo;
export const COMPOSE_BASE_IMAGE_ONLY: string = composeImageOnly;
export const COMPOSE_SSH_OVERLAY: string = composeSsh;
export const COMPOSE_DOCKER_SOCK_OVERLAY: string = composeDockerSock;
export const COMPOSE_WRAPPER: string = composeWrapper;
export const CHECK_HOST_PORT: string = checkHostPort;
