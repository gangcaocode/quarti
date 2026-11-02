import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';
import { Chip, Row, T } from './kit';

export function LangSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <>
      <T v="label">{t('me.language')}</T>
      <Row style={{ marginTop: 6 }}>
        {LANGUAGES.map((l) => <Chip key={l.code} label={l.name} on={i18n.language === l.code} onPress={() => setLanguage(l.code, true)} />)}
      </Row>
    </>
  );
}
