import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';
import { Chip, Row, T } from './kit';

export function LangSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <>
      <T v="label">{t('me.language')}</T>
      <Row style={{ marginTop: 6 }}>
        <Chip label="Français" on={i18n.language === 'fr'} onPress={() => setLanguage('fr', true)} />
        <Chip label="English" on={i18n.language === 'en'} onPress={() => setLanguage('en', true)} />
      </Row>
    </>
  );
}
