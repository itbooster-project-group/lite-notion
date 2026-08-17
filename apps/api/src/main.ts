import { bootstrap, handleBootstrapError } from "./bootstrap";

void bootstrap().catch(handleBootstrapError);
