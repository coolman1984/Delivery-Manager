import { useMutation } from '@tanstack/react-query';
import { Handshake } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { post } from '../lib/api';
import { Modal } from './dialog';
import { useToast } from './toast';
import { Button, ErrorBox, Input, Textarea } from './ui';

export type JoinType = 'store' | 'driver';

const COPY: Record<JoinType, { title: string; description: string; details: string }> = {
  store: {
    title: 'انضم لينا كمحل',
    description: 'سيب بياناتك وهنكلمك نتفق على كل التفاصيل',
    details: 'اسم المحل ونوعه وعنوانه',
  },
  driver: {
    title: 'اشتغل طيار معانا',
    description: 'سيب بياناتك وفريق التشغيل هيتواصل معاك',
    details: 'عندك موتوسيكل؟ وساكن في أنهي منطقة؟',
  },
};

export function JoinModal({ type, onClose }: { type: JoinType | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: () =>
      post('/public/leads', {
        type,
        name,
        phone,
        ...(details.trim() ? { details: details.trim() } : {}),
      }),
    onSuccess: () => {
      toast('وصلنا طلبك، هنكلمك قريب');
      setName('');
      setPhone('');
      setDetails('');
      onClose();
    },
  });
  if (!type) return null;
  const copy = COPY[type];
  function submit(e: FormEvent) {
    e.preventDefault();
    send.mutate();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      icon={Handshake}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="الاسم"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
        <Input
          label="رقم الموبايل"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <Textarea
          label="تفاصيل"
          placeholder={copy.details}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={300}
        />
        {send.error && <ErrorBox error={send.error} />}
        <Button type="submit" size="lg" block loading={send.isPending}>
          ابعت الطلب
        </Button>
      </form>
    </Modal>
  );
}
