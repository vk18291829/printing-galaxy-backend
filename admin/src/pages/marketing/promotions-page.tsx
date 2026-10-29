import { IconAlertTriangle, IconMail, IconMessage2, IconPlus, IconSend, IconTestPipe, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { confirmAction } from '@/components/common/confirm-dialog';
import { LinkPicker } from '@/components/common/link-picker';
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  countVars,
  fillTemplate,
  useCampaigns,
  useDeleteSmsTemplate,
  usePromoOverview,
  useSaveSmsTemplate,
  useSendCampaign,
  useSmsTemplates,
  useTestPromo,
  type Campaign,
  type PromoOverview,
  type SmsTemplateInput,
} from '@/features/marketing/promo-api';
import { getErrorMessage } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/format';

const STATUS: Record<Campaign['status'], { label: string; variant: 'info' | 'success' | 'destructive' | 'warning' }> = {
  sending: { label: 'Sending', variant: 'info' },
  sent: { label: 'Sent', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  stopped: { label: 'Stopped', variant: 'warning' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** SMS parts per message: 160 characters fit one SMS, longer ones are split into 153-character parts. */
const smsParts = (text: string) => (text.length <= 160 ? 1 : Math.ceil(text.length / 153));

function confirmSend(info: PromoOverview, preview: string, send: () => Promise<unknown>) {
  return confirmAction({
    title: `Send to ${formatNumber(info.audience)} customers?`,
    description: (
      <>
        <span className="mb-2 block max-h-48 overflow-y-auto rounded-md shadow-card bg-muted/50 p-3 text-xs whitespace-pre-line">{preview}</span>
        This cannot be stopped once it starts. Customers who turned off offers are skipped.
      </>
    ),
    confirmLabel: info.channel === 'email' ? 'Send emails' : 'Send SMS',
    action: send,
    successTitle: 'Sending started',
    successDescription: 'Progress is shown below.',
  });
}

function EmailComposer({ info, busy }: { info: PromoOverview; busy: boolean }) {
  const test = useTestPromo();
  const send = useSendCampaign();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [testTo, setTestTo] = useState('');

  const linkValid = !link.trim() || /^https?:\/\/\S+$/.test(link.trim());
  const valid = subject.trim().length >= 3 && message.trim().length >= 10 && linkValid;
  const input = { subject: subject.trim(), message: message.trim(), link: link.trim() || undefined, buttonLabel: buttonLabel.trim() || undefined };

  const sendTest = async () => {
    if (!EMAIL_RE.test(testTo.trim())) return toast.error('Enter an email address for the test');
    try {
      await test.mutateAsync({ ...input, to: testTo.trim() });
      toast.success(`Test email sent to ${testTo.trim()}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New email</CardTitle>
        <CardDescription>Each customer gets their own copy with a link to stop offer emails.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-subject">Subject</Label>
          <Input id="p-subject" maxLength={120} placeholder="Diwali offer: 20% off visiting cards" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="p-message">Message</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{message.length}/3000</span>
          </div>
          <Textarea
            id="p-message"
            className="min-h-40"
            maxLength={3000}
            placeholder={'Hi,\n\nThis week only, get 20% off all visiting cards and wedding invites.\n\nVisit the shop or order online.'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Leave a blank line between paragraphs.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="p-link">
                Button link <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <LinkPicker absolute value={link} onPick={setLink} />
            </div>
            <Input id="p-link" placeholder="https://printinggalaxy.in/products" value={link} onChange={(e) => setLink(e.target.value)} aria-invalid={!linkValid} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-button">Button text</Label>
            <Input id="p-button" maxLength={30} placeholder="Shop now" value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} disabled={!link.trim()} />
          </div>
        </div>

        <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto]">
          <Input type="email" placeholder="Your email for a test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button variant="outline" disabled={!valid || test.isPending} onClick={() => void sendTest()}>
            {test.isPending ? <Spinner className="size-4 text-current" /> : <IconTestPipe />} Send test
          </Button>
        </div>
        <Button
          disabled={!valid || !info.configured || info.audience === 0 || busy || send.isPending}
          onClick={() => void confirmSend(info, `${input.subject}\n\n${input.message}`, () => send.mutateAsync(input))}
        >
          <IconSend /> Email {formatNumber(info.audience)} customers
        </Button>
        {busy && <p className="text-xs text-muted-foreground">A campaign is still sending. Wait for it to finish.</p>}
        <p className="text-xs text-muted-foreground">
          A normal Gmail account sends about 500 emails a day (Google Workspace: 2,000). If the limit is reached, sending stops and the rest are counted as failed.
        </p>
      </CardContent>
    </Card>
  );
}

function TemplateDialog({ onClose }: { onClose: () => void }) {
  const save = useSaveSmsTemplate();
  const [form, setForm] = useState<SmsTemplateInput>({ name: '', msg91TemplateId: '', text: '' });
  const set = (k: keyof SmsTemplateInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const vars = countVars(form.text);

  const submit = async () => {
    if (form.name.trim().length < 2) return toast.error('Give the template a name');
    if (form.msg91TemplateId.trim().length < 5) return toast.error('Paste the MSG91 template ID');
    if (form.text.trim().length < 10) return toast.error('Paste the template text exactly as approved on DLT');
    try {
      await save.mutateAsync({ name: form.name.trim(), msg91TemplateId: form.msg91TemplateId.trim(), text: form.text.trim() });
      toast.success('Template added');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add promotional SMS template</DialogTitle>
          <DialogDescription>Register it on your DLT portal first, then add it in MSG91. Copy the details from MSG91 here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Name (for you)</Label>
            <Input id="t-name" placeholder="Festive offer" maxLength={60} value={form.name} onChange={set('name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-id">MSG91 template ID</Label>
            <Input id="t-id" className="font-mono" placeholder="6650c1b2d6fc05…" value={form.msg91TemplateId} onChange={set('msg91TemplateId')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-text">Template text</Label>
            <Textarea
              id="t-text"
              className="min-h-24 font-mono text-sm"
              placeholder="Printing Galaxy offer: {#var#} on {#var#}. Order at printinggalaxy.in. To stop offers, turn them off in your account."
              maxLength={500}
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value.replace(/[\r\n]+/g, ' ') }))}
            />
            <p className="text-xs text-muted-foreground">
              Write each blank as <code className="font-mono">{'{#var#}'}</code>, exactly as on DLT. {vars} blank{vars === 1 ? '' : 's'} found.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4 text-current" />} Add template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmsComposer({ info, busy }: { info: PromoOverview; busy: boolean }) {
  const templates = useSmsTemplates(true);
  const remove = useDeleteSmsTemplate();
  const test = useTestPromo();
  const send = useSendCampaign();
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [testPhone, setTestPhone] = useState('');

  const list = templates.data ?? [];
  const template = list.find((t) => t._id === templateId);
  const vars = template ? countVars(template.text) : 0;

  // Pick the newest template by default, and reset the blanks when the template changes.
  useEffect(() => {
    if (!templateId && list[0]) setTemplateId(list[0]._id);
  }, [list, templateId]);
  useEffect(() => setParams(Array.from({ length: vars }, () => '')), [templateId, vars]);

  if (templates.isLoading) return <PageLoader />;
  if (templates.error) return <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />;

  const preview = template ? fillTemplate(template.text, params) : '';
  const filled = params.length === vars && params.every((p) => p.trim());
  const canSend = Boolean(template && filled && info.configured && info.insideWindow && info.audience > 0 && !busy);

  const sendTest = async () => {
    if (!template) return;
    if (!/^[6-9]\d{9}$/.test(testPhone)) return toast.error('Enter a 10-digit mobile number');
    try {
      await test.mutateAsync({ templateId: template._id, params, to: testPhone });
      toast.success(`Test SMS sent to ${testPhone}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="grid items-start gap-4 *:min-w-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>New SMS</CardTitle>
          <CardDescription>Fill the blanks of an approved template. Each blank takes up to 30 characters.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {list.length === 0 ? (
            <EmptyState icon={<IconMessage2 />} title="No templates yet" description="Add a DLT-approved promotional template to start." />
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((t) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {params.map((p, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`v-${i}`}>Blank {i + 1}</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{p.length}/30</span>
                  </div>
                  <Input id={`v-${i}`} maxLength={30} value={p} onChange={(e) => setParams((all) => all.map((v, j) => (j === i ? e.target.value : v)))} />
                </div>
              ))}

              {template && (
                <div className="space-y-1.5">
                  <Label>Customers will read</Label>
                  <p className="rounded-lg shadow-card bg-muted/50 p-3 font-mono text-sm wrap-break-word">{preview}</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.length} characters · {smsParts(preview)} SMS per customer
                  </p>
                </div>
              )}

              <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto]">
                <Input inputMode="numeric" placeholder="Your mobile for a test" maxLength={10} value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ''))} />
                <Button variant="outline" disabled={!template || !filled || test.isPending} onClick={() => void sendTest()}>
                  {test.isPending ? <Spinner className="size-4 text-current" /> : <IconTestPipe />} Send test
                </Button>
              </div>
              <Button
                disabled={!canSend || send.isPending}
                onClick={() => template && void confirmSend(info, preview, () => send.mutateAsync({ templateId: template._id, params }))}
              >
                <IconSend /> Send to {formatNumber(info.audience)} customers
              </Button>
              {busy && <p className="text-xs text-muted-foreground">A campaign is still sending. Wait for it to finish.</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between border-b py-3">
          <CardTitle>Templates</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <IconPlus /> Add
          </Button>
        </CardHeader>
        {list.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t._id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.text}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{t.msg91TemplateId}</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Delete ${t.name}`}
                  onClick={() =>
                    void confirmAction({
                      tone: 'danger',
                      title: `Delete “${t.name}”?`,
                      description: 'It is removed from this list only. Past campaigns stay in the history.',
                      confirmLabel: 'Delete template',
                      action: () => remove.mutateAsync(t._id),
                      successTitle: 'Template deleted',
                    }).then((ok) => ok && templateId === t._id && setTemplateId(''))
                  }
                >
                  <IconTrash />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && <TemplateDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function CampaignHistory() {
  const campaigns = useCampaigns();
  return (
    <Card className="mt-4 gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Sent campaigns</CardTitle>
      </CardHeader>
      {campaigns.error ? (
        <ErrorState error={campaigns.error} onRetry={() => void campaigns.refetch()} />
      ) : !campaigns.data?.length ? (
        <p className="p-5 text-sm text-muted-foreground">Nothing sent yet.</p>
      ) : (
        <>
        <MobileList>
          {campaigns.data.map((c) => (
            <MobileRow
              key={c._id}
              leading={c.channel === 'email' ? <IconMail className="mt-0.5 size-4 text-muted-foreground" /> : <IconMessage2 className="mt-0.5 size-4 text-muted-foreground" />}
              title={c.title}
              subtitle={`${formatDate(c.createdAt, 'en', true)}${c.createdBy?.name ? ` · ${c.createdBy.name}` : ''}`}
              trailing={<Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>}
              meta={
                <div className="w-full space-y-1">
                  <p className="line-clamp-2">{c.text}</p>
                  <p className="tabular-nums">
                    Reached {formatNumber(c.sent)} / {formatNumber(c.total)}
                    {c.failed > 0 && <span className="text-destructive"> · {formatNumber(c.failed)} failed</span>}
                  </p>
                  {c.error && <p className="line-clamp-2 text-destructive">{c.error}</p>}
                </div>
              }
            />
          ))}
        </MobileList>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">When</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="text-right">Reached</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.data.map((c) => (
              <TableRow key={c._id}>
                <TableCell className="pl-5 align-top text-sm whitespace-nowrap text-muted-foreground">
                  {formatDate(c.createdAt, 'en', true)}
                  {c.createdBy?.name && <span className="block text-xs">{c.createdBy.name}</span>}
                </TableCell>
                <TableCell className="max-w-md align-top">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {c.channel === 'email' ? <IconMail className="size-4 shrink-0 text-muted-foreground" /> : <IconMessage2 className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{c.title}</span>
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{c.text}</p>
                  {c.error && <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{c.error}</p>}
                </TableCell>
                <TableCell className="text-right align-top text-sm tabular-nums">
                  {formatNumber(c.sent)} / {formatNumber(c.total)}
                  {c.failed > 0 && <span className="block text-xs text-destructive">{formatNumber(c.failed)} failed</span>}
                </TableCell>
                <TableCell className="pr-5 align-top">
                  <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}
    </Card>
  );
}

export default function PromotionsPage() {
  const overview = usePromoOverview();
  const campaigns = useCampaigns();

  if (overview.isLoading) return <PageLoader />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;

  const info = overview.data;
  const byEmail = info.channel === 'email';
  const busy = Boolean(campaigns.data?.some((c) => c.status === 'sending'));

  return (
    <div>
      <PageHeader
        title="Promotions"
        description={`Send an offer ${byEmail ? 'by email' : 'by SMS'} to every customer who has not turned offers off.`}
      />

      {!info.configured && (
        <Alert variant="warning" className="mb-4">
          <IconAlertTriangle />
          <AlertTitle>{byEmail ? 'Gmail is not set up' : 'MSG91 is not set up'}</AlertTitle>
          <AlertDescription>
            {byEmail
              ? 'Add GMAIL_USER and GMAIL_APP_PASSWORD to the server’s .env and restart it. Until then emails are only printed in the server log.'
              : 'Add MSG91_AUTH_KEY to the server’s .env and restart it. Until then nothing is sent.'}
          </AlertDescription>
        </Alert>
      )}
      {info.configured && !info.insideWindow && (
        <Alert variant="info" className="mb-4">
          <IconAlertTriangle />
          <AlertTitle>Outside sending hours</AlertTitle>
          <AlertDescription>Promotional SMS can only go out between 10 AM and 9 PM. You can still send a test.</AlertDescription>
        </Alert>
      )}

      {byEmail ? (
        <EmailComposer info={info} busy={busy} />
      ) : (
        <SmsComposer info={info} busy={busy} />
      )}
      <CampaignHistory />
    </div>
  );
}
