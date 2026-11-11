import { GeneratedEntity } from '../types';
import { tn } from '../i18n';

export function entitySummary(entity: GeneratedEntity): string {
    const existing = entity.files.filter((file) => file.exists).length;
    const edited = (entity.edited ?? []).length;
    return [tn('tree.filesCount', existing), ...(edited > 0 ? [tn('tree.editedCount', edited)] : [])].join(', ');
}
