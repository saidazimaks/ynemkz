import { useState } from 'react';
import Overview from './Overview';
import Partners from './Partners';
import Deals from './Deals';
import Users from './Users';
import Broadcast from './Broadcast';
import { Chips } from './chips';

type SectionId = 'overview' | 'partners' | 'deals' | 'users' | 'broadcast';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Сводка' },
  { id: 'partners', label: 'Партнёры' },
  { id: 'deals', label: 'Скидка дня' },
  { id: 'users', label: 'Люди' },
  { id: 'broadcast', label: 'Рассылка' },
];

export default function Admin() {
  const [section, setSection] = useState<SectionId>('overview');
  return (
    <div style={{ paddingBottom: 96 }}>
      <Chips items={SECTIONS} value={section} onChange={setSection} />
      {section === 'overview' && <Overview />}
      {section === 'partners' && <Partners />}
      {section === 'deals' && <Deals />}
      {section === 'users' && <Users />}
      {section === 'broadcast' && <Broadcast />}
    </div>
  );
}
