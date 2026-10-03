-- Customer logout revocations store a token hash, never the session token.
CREATE INDEX "AuditLog_action_entity_entityId_idx" ON "AuditLog"("action", "entity", "entityId");
