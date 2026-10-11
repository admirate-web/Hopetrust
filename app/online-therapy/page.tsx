import SpecialtyPage, { specialtyMetadata } from '@/components/SpecialtyPage';
import { getSpecialty } from '@/lib/specialties';

const specialty = getSpecialty('online-therapy');

export const metadata = specialtyMetadata(specialty);

export default function Page() {
  return <SpecialtyPage specialty={specialty} />;
}
