import { formatSeq } from '../utils/helpers';
import './SeqBadge.css';

export default function SeqBadge({ seq }: { seq?: number }) {
  return <span className="seq-badge">{formatSeq(seq)}</span>;
}
