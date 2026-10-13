export default function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="error">
      {error.message}
      {error.details && (
        <ul>
          {error.details.map((d, i) => (
            <li key={i}>
              {d.path && <b>{d.path}: </b>}
              {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
