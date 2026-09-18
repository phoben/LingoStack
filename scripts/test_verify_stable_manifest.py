import io
import unittest

from verify_stable_manifest import read_manifest_version, verify_stable_version


class FakeBody:
    def __init__(self, content: bytes):
        self.content = content

    def get_raw_stream(self):
        return io.BytesIO(self.content)


class FakeCos:
    def __init__(self, content: bytes):
        self.content = content
        self.requests = []

    def get_object(self, **kwargs):
        self.requests.append(kwargs)
        return {"Body": FakeBody(self.content)}


class VerifyStableManifestTests(unittest.TestCase):
    def test_reads_version_from_the_authenticated_cos_object(self):
        client = FakeCos(b'{"version":"0.0.7"}')
        self.assertEqual(
            read_manifest_version(client, bucket="bucket-123", key="stable.json"),
            "0.0.7",
        )
        self.assertEqual(
            client.requests,
            [{"Bucket": "bucket-123", "Key": "stable.json"}],
        )

    def test_rejects_a_different_stable_version(self):
        client = FakeCos(b'{"version":"0.0.6"}')
        with self.assertRaisesRegex(RuntimeError, "expected 0.0.7"):
            verify_stable_version(
                client,
                bucket="bucket-123",
                key="stable.json",
                expected_version="0.0.7",
            )

    def test_rejects_invalid_or_versionless_manifests(self):
        for content in (b"not-json", b"[]", b'{"notes":"missing"}'):
            with self.subTest(content=content):
                with self.assertRaises(RuntimeError):
                    read_manifest_version(
                        FakeCos(content), bucket="bucket-123", key="stable.json"
                    )


if __name__ == "__main__":
    unittest.main()
