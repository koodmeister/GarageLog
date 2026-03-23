export function Spinner() {
  return (
    <span
      className="garage-spinner"
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid #ccc',
        borderTopColor: '#333',
        borderRadius: '50%',
        animation: 'garage-spin 0.6s linear infinite',
        verticalAlign: 'middle',
        marginRight: 6,
      }}
    />
  );
}
