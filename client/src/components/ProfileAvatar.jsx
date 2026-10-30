export default function ProfileAvatar({ name, role = "employee", size = "small" }) {
  const label = name ? `${name} profile avatar` : `${role} profile avatar`;
  const image = role === "hr" ? "/hr-profile-avatar.svg" : "/employee-profile-avatar.svg";

  return <img className={`profile-avatar-image profile-avatar-${size}`} src={image} alt={label} title={name || undefined} />;
}
