-- Keep follow-ups from every legacy department visible in the unified queue.
INSERT INTO "Task" (id,"customerId","ownerId",reason,summary,outcome,"nextAction","dueAt","createdById","updatedAt")
 SELECT 'legacy_student_followup_'||s.id,c.id,c."ownerId",'متابعة كلية مرحّلة',s.notes,'SCHEDULED','التواصل بشأن الكورس',s."followUpAt",'MIGRATION',CURRENT_TIMESTAMP
 FROM "Student" s JOIN "Customer" c ON c.id=s."customerId" WHERE s."followUpAt" IS NOT NULL AND c."ownerId" IS NOT NULL;
INSERT INTO "Task" (id,"customerId","ownerId",reason,summary,outcome,"nextAction","dueAt","createdById","updatedAt")
 SELECT 'legacy_event_followup_'||l.id,c.id,c."ownerId",'متابعة إيفنت مرحّلة',l.notes,'SCHEDULED','التواصل بشأن الإيفنت',l."followUpAt",'MIGRATION',CURRENT_TIMESTAMP
 FROM "EventLead" l JOIN "Customer" c ON c.id=l."customerId" WHERE l."followUpAt" IS NOT NULL AND c."ownerId" IS NOT NULL;
UPDATE "Customer" c SET "lastContactAt"=(SELECT max("createdAt") FROM "CustomerNote" n WHERE n."customerId"=c.id AND n."authorId"='MIGRATION') WHERE EXISTS(SELECT 1 FROM "CustomerNote" n WHERE n."customerId"=c.id AND n."authorId"='MIGRATION');
UPDATE "Customer" c SET "followUpAt"=(SELECT min("dueAt") FROM "Task" t WHERE t."customerId"=c.id AND t."completedAt" IS NULL AND t."archivedAt" IS NULL) WHERE EXISTS(SELECT 1 FROM "Task" t WHERE t."customerId"=c.id);
INSERT INTO "MessageTemplate" (id,name,body,department,active) VALUES
 ('crm_salon_followup','متابعة الصالون','مرحبًا {name}، نتواصل معك من Sii Bello لمتابعة طلبك. ما الوقت المناسب للتواصل؟','SALON',true),
 ('crm_college_followup','تفاصيل الكورس','مرحبًا {name}، هل لديك أي استفسار عن الكورس؟ يسعدنا مساعدتك في اختيار المجموعة المناسبة.','COLLEGE',true),
 ('crm_event_followup','متابعة التسجيل','مرحبًا {name}، نود متابعة تفاصيل مشاركتك في الإيفنت. هل تحتاجين مساعدة في اختيار الباقة؟','EVENT',true),
 ('crm_product_followup','متابعة المنتج','مرحبًا {name}، نطمئن على تجربتك مع المنتج. هل تحتاجين إرشادات إضافية للاستخدام؟','PRODUCTS',true);
