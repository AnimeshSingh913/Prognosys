"""
Uploads the trained model artifacts to a Hugging Face Hub model repository, so a
deployment can download them at startup (set HF_MODEL_ID / HF_TOKEN on the server).

Usage:
    python upload_to_hf.py
"""
import getpass
import sys

from huggingface_hub import HfApi

from ml.models import MODEL_DIR, OPTIONAL_ARTIFACTS, REQUIRED_ARTIFACTS


def main():
    print("=" * 60)
    print("      PROGNOSYS MODEL UPLOADER FOR HUGGING FACE HUB")
    print("=" * 60)

    missing = [f for f in REQUIRED_ARTIFACTS if not (MODEL_DIR / f).exists()]
    if missing:
        print("\n[ERROR] Missing model files in backend/ml/:")
        for f in missing:
            print(f"  - {f}")
        print("\nTrain the models first:  python train_models.py")
        sys.exit(1)
    files = REQUIRED_ARTIFACTS + [f for f in OPTIONAL_ARTIFACTS if (MODEL_DIR / f).exists()]

    print("\nYou need a Hugging Face access token with 'write' permission:")
    print("  https://huggingface.co/settings/tokens")
    hf_token = getpass.getpass("Access token (input hidden): ").strip()
    if not hf_token:
        print("[ERROR] An access token is required.")
        sys.exit(1)

    api = HfApi(token=hf_token)
    try:
        username = api.whoami().get("name")
    except Exception as e:
        print(f"\n[ERROR] Authentication failed: {e}")
        sys.exit(1)
    print(f"\nLogged in as '{username}'")

    suggested_repo = f"{username}/prognosys-models"
    repo_id = input(f"Repository ID [{suggested_repo}]: ").strip() or suggested_repo

    try:
        api.create_repo(repo_id=repo_id, repo_type="model", private=True, exist_ok=True)
        for filename in files:
            print(f"  Uploading {filename}...")
            api.upload_file(
                path_or_fileobj=str(MODEL_DIR / filename),
                path_in_repo=filename,
                repo_id=repo_id,
                repo_type="model",
            )
    except Exception as e:
        print(f"\n[ERROR] Upload failed: {e}")
        sys.exit(1)

    print("\nDone. Set these environment variables on your server:")
    print(f"  HF_MODEL_ID = {repo_id}")
    print("  HF_TOKEN    = <a read-only token for this repository>")


if __name__ == "__main__":
    main()
