export default function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}
