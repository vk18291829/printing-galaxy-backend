import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { indianPhone, objectId } from '@/common/validation';
import { emailChannel, emailEnabled, env } from '@/config/env';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { sendMail } from '@/modules/notifications/mailer';
import { sendSms } from '@/modules/notifications/notification.service';
import {
  audience,
  audienceCount,
  checkParams,
  fillTemplate,
  insideSendWindow,
  markStaleCampaigns,
  promoEmail,
  promoReady,
  runCampaign,
} from './promo.service';
import { CampaignModel, SmsTemplateModel } from './promo.model';

/** Promotions (owner only): emails, or SMS from DLT templates on the SMS channel. */
export const adminPromoRouter = Router();

const idParams = z.object({ id: objectId });

const templateInput = z.object({
  name: z.string().trim().min(2).max(60),
  msg91TemplateId: z.string().trim().min(5).max(64),
  text: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .refine((t) => !/[\r\n]/.test(t), 'Paste the template on one line, exactly as approved on DLT'),
});

const smsInput = z.object({ templateId: objectId, params: z.array(z.string().trim()).max(10).default([]) });

const emailInput = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
  link: z
    .string()
    .trim()
    .url('Use a full link starting with https://')
    .refine((v) => /^https?:\/\//.test(v), 'Use a full link starting with https://')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  buttonLabel: z.string().trim().max(30).optional(),
});

adminPromoRouter.get('/overview', async (_req, res) => {
  res.json({
    channel: env.MESSAGING_CHANNEL,
    configured: promoReady(),
    audience: await audienceCount(),
    insideWindow: emailChannel() || insideSendWindow(),
  });
});

// ── SMS templates (SMS channel) ─────────────────────────────────────────────

adminPromoRouter.get('/templates', async (_req, res) => {
  res.json(await SmsTemplateModel.find().sort({ createdAt: -1 }).lean());
});

adminPromoRouter.post('/templates', validate({ body: templateInput }), async (req, res) => {
  const template = await SmsTemplateModel.create(req.body as z.infer<typeof templateInput>);
  audit(req, { action: 'sms_template.create', entity: 'SmsTemplate', entityId: template._id, summary: template.name });
  res.status(201).json(template);
});

adminPromoRouter.delete('/templates/:id', validate({ params: idParams }), async (req, res) => {
  const template = await SmsTemplateModel.findByIdAndDelete(req.params.id);
  if (!template) throw ApiError.notFound('Template');
  audit(req, { action: 'sms_template.delete', entity: 'SmsTemplate', entityId: template._id, summary: template.name });
  res.status(204).end();
});

// ── Test and send ───────────────────────────────────────────────────────────

/** Sends the message to one address or number, e.g. the owner's own, before a campaign. */
adminPromoRouter.post('/test', async (req, res) => {
  if (emailChannel()) {
    const input = emailInput.extend({ to: z.string().trim().toLowerCase().email('Enter a valid email address') }).parse(req.body);
    if (!emailEnabled()) throw ApiError.badRequest('Gmail is not set up on the server yet (GMAIL_USER, GMAIL_APP_PASSWORD)');
    try {
      await sendMail({ ...promoEmail({ title: input.subject, text: input.message, link: input.link, buttonLabel: input.buttonLabel }, { id: req.auth!.id, to: input.to }), subject: `[Test] ${input.subject}` });
    } catch (err) {
      throw ApiError.badRequest(`Gmail did not accept the email: ${(err as Error).message}`);
    }
  } else {
    const input = smsInput.extend({ to: indianPhone }).parse(req.body);
    const template = await SmsTemplateModel.findById(input.templateId);
    if (!template) throw ApiError.notFound('Template');
    checkParams(template.text, input.params);
    if (!env.MSG91_AUTH_KEY) throw ApiError.badRequest('MSG91 is not set up on the server yet (MSG91_AUTH_KEY)');
    try {
      await sendSms([input.to], template.msg91TemplateId, input.params);
    } catch (err) {
      throw ApiError.badRequest(`MSG91 did not accept the SMS: ${(err as Error).message}`);
    }
  }
  res.json({ ok: true });
});

adminPromoRouter.get('/campaigns', async (_req, res) => {
  await markStaleCampaigns();
  res.json(await CampaignModel.find().sort({ createdAt: -1 }).limit(50).populate('createdBy', 'name').lean());
});

adminPromoRouter.post('/campaigns', async (req, res) => {
  let draft: Record<string, unknown>;
  if (emailChannel()) {
    const input = emailInput.parse(req.body);
    draft = { channel: 'email', title: input.subject, text: input.message, link: input.link, buttonLabel: input.buttonLabel || undefined };
  } else {
    const input = smsInput.parse(req.body);
    const template = await SmsTemplateModel.findById(input.templateId);
    if (!template) throw ApiError.notFound('Template');
    checkParams(template.text, input.params);
    if (!insideSendWindow()) throw ApiError.badRequest('Promotional SMS can only be sent between 10 AM and 9 PM');
    draft = { channel: 'sms', title: template.name, text: fillTemplate(template.text, input.params), template: template._id, msg91TemplateId: template.msg91TemplateId, params: input.params };
  }
  await markStaleCampaigns();
  if (await CampaignModel.exists({ status: 'sending' })) throw ApiError.conflict('Another campaign is still sending. Wait for it to finish.');

  const people = await audience();
  if (!people.length) throw ApiError.badRequest('No customers can receive offers yet');
  const campaign = await CampaignModel.create({ ...draft, total: people.length, createdBy: req.auth?.id });
  audit(req, { action: 'campaign.send', entity: 'Campaign', entityId: campaign._id, summary: `${campaign.title} to ${people.length} customers (${campaign.channel})` });
  void runCampaign(campaign, people);
  res.status(202).json(campaign);
});
